from __future__ import annotations

from pathlib import Path

import folium
import pandas as pd
import plotly.express as px
import streamlit as st
from streamlit_folium import st_folium


ROOT = Path(__file__).resolve().parent.parent
PROCESSED_DIR = ROOT / "data" / "processed"

CROP_LABELS = {
    "vineyard": "Vineyard",
    "winter_wheat": "Winter wheat",
    "sunflower": "Sunflower",
    "sorghum": "Sorghum",
    "uncertain": "Uncertain",
}

TARGET_CROPS = ["vineyard", "winter_wheat", "sunflower", "sorghum"]

REGIONS = {
    "Catalonia": {
        "scores": PROCESSED_DIR / "catalonia_scores.parquet",
        "features": PROCESSED_DIR / "catalonia_features_2023.parquet",
        "center": (40.95, 0.5),
        "zoom": 10,
    },
    "Bavaria": {
        "scores": PROCESSED_DIR / "bavaria_scores.parquet",
        "features": PROCESSED_DIR / "bavaria_features_2023.parquet",
        "center": (48.5, 11.5),
        "zoom": 8,
    },
}

FEATURE_LABELS = {
    "ndvi_peak_value": "Peak NDVI",
    "ndvi_peak_timing_month": "Peak month",
    "ndvi_greenup_rate": "Green-up rate",
    "ndvi_senescence_rate": "Senescence rate",
    "ndwi_at_peak": "NDWI at peak",
    "ndre_at_peak": "NDRE at peak",
    "ndvi_offseason": "Off-season NDVI",
    "literature_distance": "Literature distance",
    "valid_ratio": "Valid data ratio",
}

FEATURE_ORDER = [
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


st.set_page_config(
    page_title="AgriOpenEye",
    page_icon="",
    layout="wide",
    initial_sidebar_state="expanded",
)


@st.cache_data(show_spinner=False)
def load_features(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"Missing feature file: {path}")

    df = pd.read_parquet(path)
    required = {"parcel_id", "lat", "lon", "crop", "literature_distance"}
    missing = sorted(required - set(df.columns))
    if missing:
        raise ValueError(f"{path.name} is missing required columns: {', '.join(missing)}")

    return df


@st.cache_data(show_spinner=False)
def load_scores(score_path: Path, feature_path: Path) -> tuple[pd.DataFrame, pd.DataFrame, str]:
    features = load_features(feature_path)

    if score_path.exists():
        scores = pd.read_parquet(score_path)
        source = "Model scores"
    else:
        scores = build_literature_scores(features)
        source = "Literature-distance fallback"

    required_scores = {"parcel_id", "lat", "lon", *[f"score_{crop}" for crop in TARGET_CROPS]}
    missing = sorted(required_scores - set(scores.columns))
    if missing:
        raise ValueError(f"{score_path.name} is missing required columns: {', '.join(missing)}")

    scores = scores.copy()
    score_cols = [f"score_{crop}" for crop in TARGET_CROPS]
    scores[score_cols] = scores[score_cols].clip(lower=0, upper=100)
    if "best_crop" not in scores.columns:
        scores["best_crop"] = scores[score_cols].idxmax(axis=1).str.removeprefix("score_")
    if "best_score" not in scores.columns:
        scores["best_score"] = scores[score_cols].max(axis=1).round(1)
    if "recommendation" not in scores.columns:
        scores["recommendation"] = scores["best_crop"]
    return scores.sort_values("parcel_id").reset_index(drop=True), features, source


def build_literature_scores(features: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for parcel_id, group in features.groupby("parcel_id", sort=True):
        base = {
            "parcel_id": parcel_id,
            "lat": float(group["lat"].iloc[0]),
            "lon": float(group["lon"].iloc[0]),
        }
        distances = group.set_index("crop")["literature_distance"].astype(float)
        valid_ratio = group.set_index("crop").get("valid_ratio", pd.Series(1.0, index=distances.index))

        for crop in TARGET_CROPS:
            distance = float(distances.get(crop, 1.5))
            quality = float(valid_ratio.get(crop, 1.0))
            score = max(0.0, min(100.0, (1.0 - min(distance, 1.0)) * 100.0 * quality))
            base[f"score_{crop}"] = round(score, 2)
        rows.append(base)

    return pd.DataFrame(rows)


def score_color(score: float) -> str:
    if score >= 70:
        return "#2e7d32"
    if score >= 45:
        return "#f9a825"
    return "#c62828"


def format_value(value: float) -> str:
    if pd.isna(value):
        return "-"
    if abs(float(value)) >= 10:
        return f"{float(value):.1f}"
    return f"{float(value):.3f}"


def make_map(scores: pd.DataFrame, region_name: str, selected_parcel: str | int) -> folium.Map:
    config = REGIONS[region_name]
    m = folium.Map(location=config["center"], zoom_start=config["zoom"], tiles="CartoDB positron")

    for _, row in scores.iterrows():
        parcel_id = row["parcel_id"]
        is_selected = str(parcel_id) == str(selected_parcel)
        radius = 8 if is_selected else 5
        color = "#111827" if is_selected else score_color(float(row["best_score"]))
        popup = (
            f"<b>Parcel {parcel_id}</b><br>"
            f"{CROP_LABELS[row.get('recommendation', row['best_crop'])]}: {row['best_score']:.1f}%"
        )
        folium.CircleMarker(
            location=(float(row["lat"]), float(row["lon"])),
            radius=radius,
            color=color,
            weight=2 if is_selected else 1,
            fill=True,
            fill_color=score_color(float(row["best_score"])),
            fill_opacity=0.85,
            popup=popup,
            tooltip=f"Parcel {parcel_id}",
        ).add_to(m)

    return m


def parcel_score_frame(parcel_row: pd.Series) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "Crop": [CROP_LABELS[crop] for crop in TARGET_CROPS],
            "Score": [float(parcel_row[f"score_{crop}"]) for crop in TARGET_CROPS],
        }
    ).sort_values("Score", ascending=False)


def feature_frame(features: pd.DataFrame, parcel_id: str | int, crop: str) -> pd.DataFrame:
    selected = features[
        (features["parcel_id"].astype(str) == str(parcel_id))
        & (features["crop"] == crop)
    ]
    if selected.empty:
        return pd.DataFrame(columns=["Feature", "Value"])

    row = selected.iloc[0]
    available = [col for col in FEATURE_ORDER if col in row.index]
    return pd.DataFrame(
        {
            "Feature": [FEATURE_LABELS[col] for col in available],
            "Value": [format_value(row[col]) for col in available],
        }
    )


def render_metric_row(scores: pd.DataFrame) -> None:
    total = len(scores)
    label_col = "recommendation" if "recommendation" in scores.columns else "best_crop"
    best_counts = scores[label_col].value_counts()
    avg_best = scores["best_score"].mean()
    high_count = int((scores["best_score"] >= 70).sum())

    cols = st.columns(4)
    cols[0].metric("Parcels", f"{total:,}")
    cols[1].metric("Average top score", f"{avg_best:.1f}%")
    cols[2].metric("High suitability", f"{high_count:,}")
    top_crop = best_counts.index[0] if not best_counts.empty else "-"
    cols[3].metric("Most common fit", CROP_LABELS.get(top_crop, top_crop))


def main() -> None:
    st.title("AgriOpenEye")

    with st.sidebar:
        region_name = st.radio("Region", list(REGIONS), horizontal=False)
        scores, features, score_source = load_scores(
            REGIONS[region_name]["scores"],
            REGIONS[region_name]["features"],
        )

        parcel_options = scores["parcel_id"].tolist()
        selected_parcel = st.selectbox("Parcel", parcel_options, format_func=lambda x: f"Parcel {x}")
        selected_crop = st.selectbox(
            "Feature profile",
            TARGET_CROPS,
            format_func=lambda crop: CROP_LABELS[crop],
        )
        min_score = st.slider("Minimum top score", 0, 100, 0, 5)
        crop_filter = st.multiselect(
            "Best crop",
            options=list(CROP_LABELS),
            default=TARGET_CROPS,
            format_func=lambda crop: CROP_LABELS[crop],
        )
        st.caption(score_source)

    filtered_scores = scores[
        (scores["best_score"] >= min_score)
        & (scores.get("recommendation", scores["best_crop"]).isin(crop_filter))
    ].copy()

    if filtered_scores.empty:
        st.warning("No parcels match the current filters.")
        return

    if str(selected_parcel) not in set(filtered_scores["parcel_id"].astype(str)):
        selected_parcel = filtered_scores["parcel_id"].iloc[0]

    selected_row = scores[scores["parcel_id"].astype(str) == str(selected_parcel)].iloc[0]
    score_df = parcel_score_frame(selected_row)

    render_metric_row(filtered_scores)

    map_col, detail_col = st.columns([1.45, 1], gap="large")

    with map_col:
        st_folium(
            make_map(filtered_scores, region_name, selected_parcel),
            height=590,
            use_container_width=True,
            returned_objects=[],
        )

    with detail_col:
        st.subheader(f"Parcel {selected_parcel}")
        st.metric(
            "Top recommendation",
            CROP_LABELS[selected_row.get("recommendation", selected_row["best_crop"])],
            f"{selected_row['best_score']:.1f}%",
        )

        fig = px.bar(
            score_df,
            x="Score",
            y="Crop",
            orientation="h",
            range_x=[0, 100],
            color="Score",
            color_continuous_scale=["#c62828", "#f9a825", "#2e7d32"],
            text=score_df["Score"].map(lambda v: f"{v:.1f}%"),
        )
        fig.update_layout(
            height=290,
            margin=dict(l=0, r=0, t=8, b=0),
            coloraxis_showscale=False,
            yaxis_title=None,
            xaxis_title=None,
        )
        fig.update_yaxes(categoryorder="total ascending")
        fig.update_traces(textposition="outside", cliponaxis=False)
        st.plotly_chart(fig, use_container_width=True)

        st.dataframe(
            feature_frame(features, selected_parcel, selected_crop),
            hide_index=True,
            use_container_width=True,
            height=330,
        )

    st.subheader("Ranked Parcels")
    label_col = "recommendation" if "recommendation" in filtered_scores.columns else "best_crop"
    optional_cols = [col for col in ["score_margin"] if col in filtered_scores.columns]
    display = filtered_scores[
        ["parcel_id", "lat", "lon", label_col, "best_score", *optional_cols, *[f"score_{c}" for c in TARGET_CROPS]]
    ].copy()
    display[label_col] = display[label_col].map(CROP_LABELS)
    display = display.rename(
        columns={
            "parcel_id": "Parcel",
            "lat": "Latitude",
            "lon": "Longitude",
            label_col: "Recommendation",
            "best_score": "Top score",
            "score_margin": "Score margin",
            **{f"score_{crop}": CROP_LABELS[crop] for crop in TARGET_CROPS},
        }
    )
    st.dataframe(
        display.sort_values("Top score", ascending=False),
        hide_index=True,
        use_container_width=True,
        height=320,
    )


if __name__ == "__main__":
    main()
