# AgriOpenEye — Teacher Meeting Notes

## What We Set Out to Do

The original goal was straightforward: given a plot of land, score how suitable it is for different crops using satellite imagery. No manual soil testing, no agronomist required — just satellite time-series and a model.

The target crops were vineyard, winter wheat, sunflower, and sorghum. These were chosen because they have well-documented spectral signatures in the remote sensing literature, making it possible to use vegetation indices (NDVI, NDWI, NDRE) as features.

---

## The Pivot: Why We Couldn't Just Download a Dataset

### What we expected to find

The S4A-Models GitHub repository (Orion AI Lab) references a pre-sampled OAD (Object-based Agricultural Dataset) in CSV format. That would have been a clean tabular dataset ready to train on.

### What we actually found

The `dataset/oad/` folder in the repo is a `.gitkeep` placeholder. The CSVs do not exist for download. The actual data is the raw Sen4AgriNet (S4A) dataset on HuggingFace — 281 GB of Sentinel-2 NetCDF patches covering Catalonia 2019.

### What we did instead

We provisioned an EC2 instance (`t3.xlarge`, 200 GB disk, `eu-west-1`) on AWS and:

1. Used HuggingFace `datasets` library to trigger a download of the S4A `cat_2019` config
2. The Arrow materialization step hit memory pressure and was abandoned mid-run
3. The cached raw NetCDF files were still intact on disk (~77 GB, 2,321 files)
4. We switched to direct NetCDF processing, bypassing HuggingFace entirely

This pivot is significant: instead of loading a convenient tabular file, we had to write a full preprocessing pipeline from scratch against 3D satellite patch arrays.

---

## The Two Datasets

### Dataset 1 — Sen4AgriNet (S4A) Catalonia 2019 [Training]

| Property | Value |
|---|---|
| Source | HuggingFace `orion-ai-lab/S4A`, config `cat_2019` |
| Coverage | Catalonia, Spain (tiles 31TBF, 31TCF, 31TCG, 31TDF, 31TDG) |
| Year | 2019 |
| Format | NetCDF patches, 366×366 pixels (10 m), 12 monthly composites |
| Labels | LPIS (Land Parcel Identification System) — ground-truth crop labels |
| Raw size | ~77.62 GiB, 2,321 files |
| Processed output | 64,943 parcel rows, 44 MB CSV |

This is the only labelled dataset used. It contains real legal field boundaries matched to crop declarations, which makes the labels reliable. The limitation is it covers only one region and one year.

**Confirmed label mapping** (from S4A-Models upstream):
- `110 → winter_wheat`
- `140 → sorghum`
- `330 → vineyard`
- `438 → sunflower`

Early experiments used guessed label codes — that was wrong and had to be fixed.

**Class distribution after processing:**

| Crop | Parcels | Share |
|---|---|---|
| vineyard | 60,837 | 93.7% |
| sunflower | 1,916 | 2.9% |
| sorghum | 1,807 | 2.8% |
| winter_wheat | 383 | 0.6% |

This imbalance is real — Catalonia is genuinely dominated by vineyards. It is not a sampling artefact.

---

### Dataset 2 — Google Earth Engine Exports [Inference only]

| Property | Value |
|---|---|
| Source | Google Earth Engine (GEE) grid sampling |
| Files | `data/gee_exports/catalonia_2023.csv`, `bavaria_2023.csv` |
| Year | 2023 |
| Format | Regular grid of lat/lon points with monthly median NDVI/NDWI/NDRE |
| Labels | **None** — inference only |

This dataset was already present in the repository when the project started. It provides the inference targets: grid points across Catalonia and Bavaria, one row per point, with pre-computed vegetation index time series.

**Key distinction from Dataset 1:** These are evenly-spaced grid points, not actual parcel polygons. The model scores every grid point regardless of whether it is agricultural land, forest, urban area, or water.

**Bavaria is entirely inference.** There is no S4A Bavaria training data. The model was trained on Catalonia 2019 and applied to Bavaria 2023 without retraining. This is a deliberate domain-shift test.

---

## Preprocessing Pipeline

The expensive step is not model training. It is converting raw Sentinel-2 patches into parcel-level features.

```
Raw NetCDF (77 GB, EC2)
    ↓
For each patch:
  - Verify ES/2019 metadata
  - Read B03, B04, B05, B08, labels mask, parcels mask, timestamps
  - Divide reflectance values by 10,000 (int16 → float)
  - Clip to [-1, 1]
  - Upsample B05 from 20m to 10m (B05 is 183×183, needs 366×366)
  - Compute per-pixel monthly median:
      NDVI = (B08 - B04) / (B08 + B04)
      NDWI = (B03 - B08) / (B03 + B08)
      NDRE = (B08 - B05) / (B08 + B05)
  - Aggregate by parcel mask → per-parcel monthly median
  - Assign majority crop label per parcel
  - Filter to 4 target crops
    ↓
training_data.csv (64,943 rows, 44 MB)
```

---

## Feature Engineering

`src/features.py` derives 8 agronomic features per (parcel × crop) pair. With 4 crops, each parcel has a 32-feature vector.

| Feature | Meaning |
|---|---|
| `ndvi_peak_value` | Max NDVI during crop's expected peak window |
| `ndvi_peak_timing_month` | Month of global NDVI maximum |
| `ndvi_greenup_rate` | NDVI slope from February to peak (should be positive) |
| `ndvi_senescence_rate` | NDVI slope from peak to November (**should be negative** — this is decline) |
| `ndwi_at_peak` | Mean water index at peak (moisture signal) |
| `ndre_at_peak` | Mean red-edge index at peak (chlorophyll signal) |
| `ndvi_offseason` | Mean NDVI Dec–Feb (dormancy level) |
| `literature_distance` | Euclidean distance from observed profile to crop reference midpoint |

The model does not see raw time series. It sees *how each parcel's time series compares to each crop's known seasonal profile*. This is why it can score an unlabelled parcel — it measures spectral resemblance.

---

## Model

**Final choice:** Multiclass XGBoost (`multi:softprob`)

```
XGBClassifier(
    objective="multi:softprob",
    n_estimators=350,
    max_depth=3,
    learning_rate=0.05,
    subsample=0.9,
    colsample_bytree=0.9,
    reg_lambda=2.0,
    min_child_weight=3,
    tree_method="hist",
    class_weight_alpha=0.0  # unweighted — best precision/F1 tradeoff
)
```

**Why multiclass XGBoost over binary MLPs (first attempt):**

| Issue with binary MLPs | Why XGBoost solves it |
|---|---|
| One model per crop — probabilities don't compete | Softmax forces crops to compete for probability mass |
| Synthetic balancing increased false positives for rare crops | Unweighted multiclass gives better precision |
| Mutually exclusive labels treated as independent | Multiclass directly models mutual exclusivity |

**Results (held-out 20% stratified split):**

```
              precision    recall  f1-score   support

sorghum          0.72      0.48      0.58       356
sunflower        0.81      0.60      0.69       382
vineyard         0.97      1.00      0.98      9,557
winter_wheat     0.75      0.57      0.64        69

accuracy                             0.96    10,364
macro avg        0.81      0.66      0.72    10,364
```

96% accuracy is misleading — vineyard dominates. Macro F1 of 0.72 is the honest number.

**Abstention logic:**
```python
if best_score >= 55% AND score_margin >= 10pp:
    recommendation = best_crop
else:
    recommendation = "uncertain"  # (now shown as "Low confidence" in UI)
```

---

## Question: How Much of a Problem is Low Data Density?

This is worth addressing directly, because it affects both training and inference.

### Training data density

| Crop | Training examples | Problem |
|---|---|---|
| vineyard | 60,837 | No problem — well represented |
| sunflower | 1,916 | Limited but acceptable |
| sorghum | 1,807 | Limited but acceptable |
| winter_wheat | 383 | **Serious problem** |

383 winter wheat examples means the model has seen very few distinct field signatures. The 75% precision looks reasonable but is likely unstable — a different train/test split could move that number significantly. Winter wheat metrics should be treated as indicative, not reliable.

More fundamentally: the S4A dataset covers tiles 31TBF/TCF/TCG/TDF/TDG (all Ebro Delta / coastal Catalonia). Winter wheat is not a dominant crop there. To get reliable winter wheat performance you would need data from regions where it is common (Castile, Bavaria, northern France).

### Inference data density (the GEE grid)

The GEE export uses a **regular spatial grid**, not actual parcel polygons. This creates two problems:

1. **Not all grid points are farmland.** The model will score a forested hillside, a reservoir, or a highway the same way it scores a field. There is no land-use mask applied. Some "uncertain" outputs are uncertain because the land is not agricultural, not because the model is confused about crops.

2. **One point per cell, not area-weighted.** A large wheat field and a small vineyard next to each other might both fall in the same grid cell, or might not be represented at all. Real agricultural analysis uses parcel polygons from LPIS or similar registries.

3. **Bavaria is a 4-year, 1,500 km domain shift.** The model was trained on Catalonia 2019. Bavaria 2023 has:
   - Different crop calendar (cooler climate, later seasons)
   - Different dominant crops (much more wheat and rapeseed, much less vineyard)
   - Different atmospheric correction conditions
   - 4-year gap during which Sentinel-2 calibration was updated

The Bavaria output should be read as "this location looks spectrally like [crop] relative to Catalonian 2019 references" — not as a direct agronomic recommendation.

### Summary answer

Low data density is a **moderate problem for training** (especially winter wheat) and a **more serious problem for inference** (grid points ≠ parcels, no land-use filtering, Bavaria domain shift). The system is a credible prototype for demonstrating the concept, but would need real parcel polygons, multi-region training data, and a land-use mask before being used for actual agronomic decisions.

---

## Limitations Summary

| Limitation | Impact |
|---|---|
| Training labels from one region and one year | Limited generalization |
| Vineyard dominates training set (93.7%) | Rare-crop recall weak |
| Winter wheat has only 383 examples | Metrics unstable |
| Inference uses grid points, not parcels | No land-use filtering |
| No Bavaria training data | Domain shift unvalidated |
| Model scores spectral resemblance, not yield | Not directly actionable |
| Probability scores not calibrated | "62%" has no formal probabilistic meaning |
| No soil, water, elevation, or climate features | Satellite-only view |

---

## What Is Production-Ready vs. What Is a Prototype

| Component | Status |
|---|---|
| Sentinel-2 preprocessing pipeline | ✅ Works, reproducible |
| Feature engineering | ✅ Solid, agronomically grounded |
| XGBoost multiclass model | ✅ Best available choice for this data |
| Abstention / uncertainty logic | ✅ Better than forcing a recommendation |
| React + FastAPI app | ✅ Clean, functional |
| Geocoding search + nearest parcel | ✅ Works, good UX |
| LLM agronomist summaries | ✅ Adds interpretability |
| Winter wheat performance | ⚠️ Insufficient training data |
| Bavaria inference | ⚠️ Domain shift, no validation |
| Grid-point inference | ⚠️ Not real parcel boundaries |
| Probability calibration | ❌ Not done |
| Multi-year / multi-region training | ❌ Not done |
