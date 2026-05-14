"""FastAPI backend — serves parquet score and feature data as JSON."""

from pathlib import Path
import os
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from dotenv import load_dotenv
from pydantic import BaseModel

# Load .env file
load_dotenv()

app = FastAPI(title="AgriOpenEye API")

# Initialize OpenAI client
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Vercel + local dev — tighten to specific domain after deploy
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Support both local dev (project root 3 levels up) and Vercel (root = repo root)
_HERE = Path(__file__).resolve().parent
ROOT = _HERE.parent.parent
PROCESSED = ROOT / "data" / "processed"

SCORE_FILES = {
    "catalonia": PROCESSED / "catalonia_scores.parquet",
    "bavaria":   PROCESSED / "bavaria_scores.parquet",
}
FEATURE_FILES = {
    "catalonia": PROCESSED / "catalonia_features_2023.parquet",
    "bavaria":   PROCESSED / "bavaria_features_2023.parquet",
}

_cache: dict = {}

FEATURE_COLS = [
    "crop",
    "ndvi_peak_value",
    "ndvi_peak_timing_month",
    "ndvi_greenup_rate",
    "ndvi_senescence_rate",
    "ndwi_at_peak",
    "ndre_at_peak",
    "ndvi_offseason",
    "literature_distance",
    "valid_ratio",
]


def _load(path: Path) -> pd.DataFrame:
    if path not in _cache:
        _cache[path] = pd.read_parquet(path)
    return _cache[path]


# ---------------------------------------------------------------------------
# Knowledge base — loaded once at startup, injected in full into chat prompt
# (KB is ~5k tokens; gpt-4o-mini context is 128k — no chunking/FAISS needed)
# ---------------------------------------------------------------------------
_API_DIR = Path(__file__).resolve().parent
_KB_TEXT: str = ""

@app.on_event("startup")
async def startup():
    global _KB_TEXT
    kb_path = _API_DIR / "knowledge_base.md"
    if kb_path.exists():
        _KB_TEXT = kb_path.read_text()
        print(f"[KB] Loaded knowledge base ({len(_KB_TEXT)} chars)")
    else:
        print(f"[KB] WARNING: knowledge base not found at {kb_path}")


# ---------------------------------------------------------------------------
# Chat request/response models
# ---------------------------------------------------------------------------
class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str

class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []
    parcel_id: Optional[int] = None
    region: Optional[str] = None


def _format_parcel_context(parcel_id: int, region: str) -> str:
    """Build a plain-text summary of parcel scores + features to inject into chat."""
    lines = [f"Selected parcel: #{parcel_id} in {region.capitalize()}"]
    try:
        scores_df = _load(SCORE_FILES[region])
        row = scores_df[scores_df["parcel_id"].astype(int) == parcel_id]
        if not row.empty:
            r = row.iloc[0]
            lines.append(f"Best crop: {r.get('best_crop', '?')} ({r.get('best_score', 0):.1f}%)")
            lines.append(f"Recommendation: {r.get('recommendation', '?')}")
            lines.append(f"Score margin: {r.get('score_margin', 0):.1f}pp")
            for crop in ["vineyard", "winter_wheat", "sunflower", "sorghum"]:
                s = r.get(f"score_{crop}")
                if s is not None:
                    lines.append(f"  {crop}: {float(s):.1f}%")
    except Exception:
        pass
    try:
        feat_df = _load(FEATURE_FILES[region])
        subset = feat_df[feat_df["parcel_id"].astype(int) == parcel_id]
        if not subset.empty:
            lines.append("Features by crop:")
            for _, fr in subset.iterrows():
                crop = fr.get("crop", "?")
                lines.append(
                    f"  {crop}: peak_ndvi={fr.get('ndvi_peak_value', '?'):.3f} "
                    f"peak_month={int(fr.get('ndvi_peak_timing_month', 0))} "
                    f"greenup={fr.get('ndvi_greenup_rate', '?'):.4f} "
                    f"senescence={fr.get('ndvi_senescence_rate', '?'):.4f} "
                    f"ndwi={fr.get('ndwi_at_peak', '?'):.3f} "
                    f"ndre={fr.get('ndre_at_peak', '?'):.3f} "
                    f"offseason={fr.get('ndvi_offseason', '?'):.3f} "
                    f"lit_dist={fr.get('literature_distance', '?'):.3f}"
                )
    except Exception:
        pass
    return "\n".join(lines)


@app.post("/api/chat")
def chat(body: ChatRequest):
    """KB-grounded farmer chat assistant."""
    # Parcel context (if user has a parcel selected)
    parcel_context = ""
    if body.parcel_id is not None and body.region in SCORE_FILES:
        parcel_context = _format_parcel_context(body.parcel_id, body.region)

    system_prompt = """You are AgriOpenEye's farming assistant. You help farmers understand their land's crop suitability scores.

Rules:
- Answer in plain, direct language. No jargon without explanation.
- Keep answers short — 2–4 sentences max unless a detailed breakdown is needed.
- Ground every answer in the knowledge base below. Never invent data or scores.
- If asked about a specific parcel, use the parcel data provided.
- If asked something outside scope (weather, pricing, subsidies), say so and suggest where to look.
- Do not apologise or use filler phrases.

=== KNOWLEDGE BASE ===
{kb}
=== END KNOWLEDGE BASE ===

{parcel_section}""".format(
        kb=_KB_TEXT or "Knowledge base not available.",
        parcel_section=f"=== SELECTED PARCEL ===\n{parcel_context}\n=== END PARCEL ===" if parcel_context else "",
    )

    messages = [{"role": "system", "content": system_prompt}]
    # Include conversation history (last 6 turns to stay within token budget)
    for msg in body.history[-6:]:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": body.message})

    try:
        resp = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            max_tokens=200,
            temperature=0.3,
        )
        return {"reply": resp.choices[0].message.content.strip()}
    except Exception as e:
        raise HTTPException(500, f"Chat error: {str(e)}")


def _serialise(df: pd.DataFrame) -> list:
    """Convert DataFrame to JSON-safe list, replacing non-finite floats with None."""
    records = df.to_dict(orient="records")
    for row in records:
        for k, v in row.items():
            if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
                row[k] = None
            elif isinstance(v, (np.integer,)):
                row[k] = int(v)
            elif isinstance(v, (np.floating,)):
                row[k] = float(v)
    return records


@app.get("/api/scores/{region}")
def get_scores(region: str):
    if region not in SCORE_FILES:
        raise HTTPException(404, f"Unknown region '{region}'. Use 'catalonia' or 'bavaria'.")
    df = _load(SCORE_FILES[region]).copy()
    df["parcel_id"] = df["parcel_id"].astype(float).astype(int)
    return _serialise(df)


@app.get("/api/features/{region}/{parcel_id}")
def get_features(region: str, parcel_id: int):
    if region not in FEATURE_FILES:
        raise HTTPException(404, f"Unknown region '{region}'.")
    df = _load(FEATURE_FILES[region])
    subset = df[df["parcel_id"].astype(int) == parcel_id].copy()
    if subset.empty:
        raise HTTPException(404, f"Parcel {parcel_id} not found in {region}.")
    available = [c for c in FEATURE_COLS if c in subset.columns]
    return _serialise(subset[available])


@app.get("/api/summarize/{region}/{parcel_id}/{crop}")
def summarize_features(region: str, parcel_id: int, crop: str, score: float = None):
    """Generate LLM summary of crop suitability features for a parcel."""
    if region not in FEATURE_FILES:
        raise HTTPException(404, f"Unknown region '{region}'.")

    df = _load(FEATURE_FILES[region])
    subset = df[(df["parcel_id"].astype(int) == parcel_id) & (df["crop"] == crop)]

    if subset.empty:
        raise HTTPException(404, f"No features for parcel {parcel_id}, crop {crop} in {region}.")

    row = subset.iloc[0].to_dict()

    # Format score context — anchor LLM to model's own confidence
    score_context = ""
    if score is not None:
        if score >= 55:
            score_context = f"\nThe ML model scored this crop at {score:.1f}% — a HIGH confidence match. Your summary must reflect this positive assessment."
        elif score >= 35:
            score_context = f"\nThe ML model scored this crop at {score:.1f}% — a MODERATE match with low confidence. Note the uncertainty."
        else:
            score_context = f"\nThe ML model scored this crop at {score:.1f}% — a POOR match. Your summary should reflect poor suitability."

    # Format features as readable text
    features_text = f"""
Crop: {crop}
Model score: {f'{score:.1f}%' if score is not None else 'N/A'}
Peak NDVI: {row.get('ndvi_peak_value', 'N/A')}
Peak Month: {row.get('ndvi_peak_timing_month', 'N/A')}
Greenup Rate: {row.get('ndvi_greenup_rate', 'N/A')}
Senescence Rate: {row.get('ndvi_senescence_rate', 'N/A')}
NDWI at Peak: {row.get('ndwi_at_peak', 'N/A')}
NDRE at Peak: {row.get('ndre_at_peak', 'N/A')}
Off-season NDVI: {row.get('ndvi_offseason', 'N/A')}
Literature Distance: {row.get('literature_distance', 'N/A')}
""".strip()

    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": f"""You are an expert agronomist. Analyze the crop suitability features and provide a concise, one-sentence summary consistent with the ML model's score. Be direct and practical.{score_context}

Key metrics:
- Greenup Rate: positive = NDVI rising (good). Faster = more vigorous spring growth
- Senescence Rate: NEGATIVE values = NDVI declining after peak (normal, expected). More negative = faster decline
- Literature Distance: how far observed profile is from reference range (lower = better match)
- Peak NDVI, NDWI, NDRE: at expected seasonal peak (higher/more extreme = better match to crop signature)
- Off-season NDVI: winter dormancy level (crops should be low in winter)
- CRITICAL: Your suitability assessment MUST be consistent with the model score above.""",
                },
                {
                    "role": "user",
                    "content": f"Summarize the suitability of {crop} for this parcel based on these vegetation indices:\n\n{features_text}",
                }
            ],
            max_tokens=60,
            temperature=0.2,
        )

        summary = response.choices[0].message.content.strip()
        return {"summary": summary}

    except Exception as e:
        raise HTTPException(500, f"Error generating summary: {str(e)}")
