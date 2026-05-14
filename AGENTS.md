# Agent Notes: AgriOpenEye Data Pipeline

This project uses Sen4AgriNet / S4A Catalonia 2019 data from HuggingFace to build parcel-level crop suitability models. The expensive step is converting raw Sentinel-2 NetCDF patch data into a compact parcel-level training table. Model training is fast once `data/processed/training_data.csv` exists.

## Current State

- Preferred model: multiclass XGBoost in `scripts/train_xgb_multiclass.py`.
- Shared feature logic: `src/features.py`.
- Preferred model artifact: `src/model_xgb_multiclass.pkl`.
- Preferred score files:
  - `data/processed/catalonia_scores.parquet`
  - `data/processed/bavaria_scores.parquet`
  - `data/processed/catalonia_scores_xgb.parquet`
  - `data/processed/bavaria_scores_xgb.parquet`
- Evaluation artifacts:
  - `data/processed/xgb_multiclass_report.txt`
  - `data/processed/confusion_matrix_xgb.csv`
- Legacy binary MLP baseline:
  - `scripts/train_and_infer.py`
  - `scripts/legacy_train_binary_mlp.py`

## Data And Infrastructure Observations

- AWS infrastructure was provisioned in `eu-west-1` using Terraform under `infra/`.
- The EC2 instance cached S4A `cat_2019` raw downloads under:
  - `/home/ubuntu/.cache/huggingface/datasets/downloads`
- Cache inspection found:
  - `2,321` NetCDF files
  - about `77.62 GiB`
  - country code `ES`
  - year `2019`
  - tiles `31TBF`, `31TCF`, `31TCG`, `31TDF`, `31TDG`
- Avoid using `datasets.load_dataset("orion-ai-lab/S4A", "cat_2019")` as the main processing path. It attempted HuggingFace Arrow materialization, was slow, and previously hit memory pressure. Direct NetCDF processing is the preferred path.

## Confirmed Label Mapping

Use the upstream S4A-Models selected class mapping:

- `110 -> winter_wheat`
- `140 -> sorghum`
- `330 -> vineyard`
- `438 -> sunflower`

This is encoded in `scripts/process_cached_netcdf_ec2.py`. Do not revert to the older guessed mapping from early experiments.

## Preprocessing Required

Raw S4A patches are not model-ready. Production preprocessing should:

1. Read cached NetCDF patch files directly.
2. Extract `B03`, `B04`, `B05`, `B08`, `labels`, `parcels`, and timestamps.
3. Convert raw reflectance values by dividing by `10000`.
4. Clip reflectance/index values to `[-1, 1]`.
5. Upsample `B05` from 20 m to 10 m before NDRE computation.
6. Compute:
   - `NDVI = (B08 - B04) / (B08 + B04)`
   - `NDWI = (B03 - B08) / (B03 + B08)`
   - `NDRE = (B08 - B05) / (B08 + B05)`
7. Aggregate each index into monthly medians.
8. Use the `parcels` mask to aggregate monthly index values per parcel.
9. Use the `labels` mask to assign each parcel a majority crop label.
10. Filter to the four target crop classes.
11. Write `training_data.csv` with:
    - `parcel_id`
    - `crop_label`
    - `lat`
    - `lon`
    - `NDVI_jan` through `NDVI_dec`
    - `NDWI_jan` through `NDWI_dec`
    - `NDRE_jan` through `NDRE_dec`

Current full output:

- `data/processed/training_data.csv`
- `64,943` rows
- about `44 MiB`
- distribution:
  - vineyard `60,837`
  - sunflower `1,916`
  - sorghum `1,807`
  - winter_wheat `383`

## Feature Engineering

Use `src/features.py` for all shared feature generation. The model derives 8 features per candidate crop:

- `ndvi_peak_value`
- `ndvi_peak_timing_month`
- `ndvi_greenup_rate`
- `ndvi_senescence_rate`
- `ndwi_at_peak`
- `ndre_at_peak`
- `ndvi_offseason`
- `literature_distance`

The multiclass model concatenates these for four crops into 32 columns. Keep app, training, and legacy scripts aligned through `src/features.py`.

## Model Recommendation

Use multiclass XGBoost for the main project narrative and artifacts.

Reasoning:

- The S4A crop label is mutually exclusive.
- Multiclass probabilities force crops to compete.
- XGBoost is a strong fit for compact tabular features.
- One-vs-rest MLPs produced weaker rare-class precision.
- Synthetic balancing improved recall in places but over-predicted rare crops.

Current XGBoost metrics on a held-out stratified 20% split:

```text
              precision    recall  f1-score   support

sorghum          0.72      0.48      0.58       356
sunflower        0.81      0.60      0.69       382
vineyard         0.97      1.00      0.98      9557
winter_wheat     0.75      0.57      0.64        69

accuracy                              0.96     10364
macro avg        0.81      0.66      0.72     10364
weighted avg     0.96      0.96      0.96     10364
```

## Inference Output

`scripts/train_xgb_multiclass.py` writes crop scores plus:

- `best_crop`
- `best_score`
- `score_margin`
- `recommendation`

Rows become `uncertain` when `best_score < 55` or `score_margin < 10`. This avoids forcing weak recommendations.

## Reproduction Commands

Train locally after `training_data.csv` exists:

```bash
PYTHONPATH=. python3 scripts/train_xgb_multiclass.py
```

Run the app:

```bash
streamlit run app/main.py
```

Stop EC2 when preserving cached data but not processing:

```bash
aws ec2 stop-instances --region eu-west-1 --instance-ids <INSTANCE_ID>
```

Destroy resources only after emptying S3:

```bash
aws s3 rm s3://agri-open-eye-data --recursive
bash infra/destroy.sh
```

## Operational Notes

- Do not overwrite the XGBoost score files with legacy MLP output unless explicitly comparing baselines.
- Keep production model files separate from smoke artifacts.
- Watch EC2 disk usage during larger runs with `df -h /`.
- Current Terraform bucket may block destroy if S3 is non-empty.
- Any credentials previously pasted into chat should be rotated and moved to a proper secret manager.
