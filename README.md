# AgriOpenEye

Academic project for "Perspectives on AI", ESADE Business School.

AgriOpenEye turns Sentinel-2 crop time-series data into crop suitability scores for agricultural plots. The current version trains on Sen4AgriNet / S4A Catalonia 2019 LPIS-labelled parcels and applies the learned model to Catalonia and Bavaria 2023 grid exports.

This README is intentionally detailed because it is also the project log for the final report: what we tried, what failed, what worked, why the current solution was chosen, and what would need to change if this became a real product.

## Final Goal

The goal is to help a farmer compare crop options for a plot without needing to interpret raw satellite bands. For each point or parcel, the system gives scores for:

- vineyard
- winter wheat
- sunflower
- sorghum

The current output should be interpreted as a spectral crop-suitability proxy, not as a yield forecast or a guaranteed agronomic recommendation. It says, "based on how this location's Sentinel-2 vegetation and water-index profile behaves, which of the target crops does it most resemble?"

## Current Implementation

```text
HuggingFace S4A cat_2019 raw NetCDF patches
        |
        | EC2 direct NetCDF preprocessing
        v
data/processed/training_data.csv
        |
        | shared feature engineering in src/features.py
        v
32-feature parcel table
        |
        | multiclass XGBoost
        v
src/model_xgb_multiclass.pkl
        |
        | inference on Catalonia/Bavaria 2023 exports
        v
data/processed/catalonia_scores.parquet
data/processed/bavaria_scores.parquet
```

The preferred model path is `scripts/train_xgb_multiclass.py`. The older one-vs-rest MLP path remains available as a baseline through `scripts/train_and_infer.py` and `scripts/legacy_train_binary_mlp.py`, but it is not the recommended model for the report.

## Project Journey

### 1. Initial Repository And Infrastructure

The repository already contained Terraform files under `infra/`, a Streamlit application under `app/`, Google Earth Engine-style inference exports under `data/gee_exports/`, and early model scripts under `scripts/`.

The infrastructure plan created:

- an S3 bucket, `agri-open-eye-data`
- an EC2 instance in `eu-west-1`
- a 200 GiB gp3 root volume
- IAM permissions for S3 read/write
- SSH access through a generated key

Because the S4A dataset is large, the practical decision was to download/cache the raw HuggingFace data on EC2 and store reusable artifacts in S3 rather than downloading 100+ GiB locally.

### 2. Data Download Discovery

The initial approach used HuggingFace `datasets.load_dataset(...)`. That path was not ideal for this project because it attempted HuggingFace Arrow materialization, used significant memory, and was hard to resume predictably. A partial download left more than 70 GiB on the EC2 volume. We inspected the cache and found that the downloaded files were useful raw NetCDF files, not wasted data.

The cache inspection found:

```text
NetCDF files: 2,321
Raw cache size: ~77.62 GiB
Country code: ES
Year: 2019
Tiles: 31TBF, 31TCF, 31TCG, 31TDF, 31TDG
```

This confirmed that the already-downloaded data contained Spain/Catalonia records and could be reused.

### 3. Smoke Batch

Before processing everything, we ran a very small smoke batch directly against cached NetCDF files. The test proved that the mechanics worked:

- read NetCDF patch files directly
- extract Sentinel-2 bands
- compute NDVI, NDWI, and NDRE
- aggregate by month and parcel
- produce a compact training CSV
- train small test models

The smoke test completed quickly and produced a tiny training set, but its labels were not production-valid. It used temporary label assumptions only to prove the pipeline mechanics.

### 4. Label Mapping Problem

The early repo guessed crop label codes. That was unsafe. The major correction was to use the upstream S4A-Models selected class mapping for the four target crops:

```text
110 -> winter_wheat
140 -> sorghum
330 -> vineyard / grapes
438 -> sunflower
```

This mapping is encoded in `scripts/process_cached_netcdf_ec2.py`.

This step mattered because every later model depends on correct labels. A good model trained on wrong labels would still be wrong.

### 5. Full Preprocessing

The final preprocessing approach avoided HuggingFace Arrow and read the cached NetCDF files directly on EC2.

Script:

```text
scripts/process_cached_netcdf_ec2.py
```

For each patch, preprocessing:

1. Verifies Spain/Catalonia 2019 metadata.
2. Reads `B03`, `B04`, `B05`, `B08`, `labels`, `parcels`, and timestamps.
3. Converts Sentinel-2 reflectance values by dividing by `10000`.
4. Clips reflectance/index values to `[-1, 1]`.
5. Upsamples `B05` from 20 m to 10 m before NDRE computation.
6. Computes:
   - `NDVI = (B08 - B04) / (B08 + B04)`
   - `NDWI = (B03 - B08) / (B03 + B08)`
   - `NDRE = (B08 - B05) / (B08 + B05)`
7. Aggregates each index into monthly medians.
8. Uses the `parcels` mask to aggregate monthly values per parcel.
9. Uses the `labels` mask to assign each parcel its majority crop label.
10. Filters to the four target crop classes.
11. Writes checkpointed CSV output and uploads the final table to S3.

Final processed table:

```text
data/processed/training_data.csv
Rows: 64,943
Size: ~44 MiB
```

Class distribution:

```text
vineyard        60,837
sunflower        1,916
sorghum          1,807
winter_wheat       383
```

The most important preprocessing observation is that the expensive part is not model training. The expensive part is converting raw Sentinel-2 NetCDF patches into a compact parcel-level table.

### 6. First Modeling Attempts

The original modeling direction used crop-specific one-vs-rest MLP classifiers. We also tried class balancing with synthetic minority oversampling / SMOTE-style logic to compensate for the extreme vineyard dominance.

What worked:

- The models trained successfully.
- Accuracy improved because vineyard is easy to classify and dominates the data.
- The app could consume generated score files.

What did not work:

- Precision for rare classes stayed low.
- Independent binary classifiers allowed multiple crops to receive high scores for the same parcel.
- Synthetic balancing made the model more willing to predict rare classes, but that often increased false positives.
- High overall accuracy was misleading because most examples were vineyard.

This is normal for imbalanced remote-sensing classification: accuracy can look strong while minority-class precision and recall remain weak. For a crop recommendation interface, false rare-crop recommendations are especially risky.

### 7. Literature Gate Attempt

We also considered using crop literature profiles as stricter hard gates. The profiles define expected windows and ranges for NDVI, NDWI, and NDRE. This was useful as feature context but too brittle as a hard rule. A strict gate produced too few or no positives in some cases because real satellite signals are noisy, monthly aggregation is coarse, and crop calendars vary.

Resolution: keep literature knowledge as engineered features, not as hard filters.

### 8. Final Model Choice

The final model is a multiclass XGBoost classifier:

```text
scripts/train_xgb_multiclass.py
```

Why this makes sense:

- The target labels are mutually exclusive in the S4A label mask.
- A multiclass model forces crops to compete for probability mass.
- XGBoost is strong for tabular, engineered features.
- It handles nonlinear interactions without requiring a large neural network.
- Training is fast once preprocessing is complete.
- It gives better rare-class precision than the independent binary MLP approach.

Why not PyTorch for the current version:

- The current data is a compact tabular feature set, not raw images or full temporal tensors.
- PyTorch would work technically, but it would add complexity without a clear benefit at this scale.
- PyTorch becomes more appropriate if the project later models raw pixel patches, full Sentinel-2 temporal curves, or parcel sequences directly.

## Feature Engineering

Shared feature logic now lives in:

```text
src/features.py
```

The processed training data has 36 monthly index columns:

```text
NDVI_jan ... NDVI_dec
NDWI_jan ... NDWI_dec
NDRE_jan ... NDRE_dec
```

For each candidate crop, the project derives 8 agronomic features:

| Feature | Meaning |
|---|---|
| `ndvi_peak_value` | Max NDVI during the crop's expected peak window |
| `ndvi_peak_timing_month` | Month of max NDVI over the full year |
| `ndvi_greenup_rate` | NDVI slope from February to the crop peak month |
| `ndvi_senescence_rate` | NDVI slope from peak month to November |
| `ndwi_at_peak` | Mean NDWI during the crop peak window |
| `ndre_at_peak` | Mean NDRE during the crop peak window |
| `ndvi_offseason` | Mean NDVI in December/January/February |
| `literature_distance` | Distance from observed NDVI/NDWI/NDRE to the crop reference midpoint |

Reference profiles:

| Crop | Peak window | NDVI peak | NDWI | NDRE |
|---|---:|---:|---:|---:|
| vineyard | Jul-Aug | 0.35-0.55 | -0.15-0.05 | 0.15-0.35 |
| winter_wheat | Apr-May | 0.60-0.80 | 0.05-0.25 | 0.20-0.40 |
| sunflower | Jul-Aug | 0.50-0.70 | -0.25-0.00 | 0.15-0.30 |
| sorghum | Aug-Sep | 0.55-0.75 | -0.20-0.05 | 0.15-0.35 |

The multiclass model computes these 8 features for each crop and concatenates them into one 32-feature vector:

```text
vineyard__ndvi_peak_value
...
sorghum__literature_distance
```

This means the model does not only see the observed time series. It sees how the observed time series compares with each crop's expected seasonal profile.

## XGBoost Training Details

Model:

```text
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
)
```

Class imbalance was tested with different weight strengths:

```text
alpha = 0.0, 0.25, 0.5, 0.75, 1.0
```

where `alpha=1.0` means fully balanced weighting and `alpha=0.0` means unweighted. Fully balanced weights improved minority-class recall in some cases but over-predicted rare crops and reduced precision. The best precision/macro-F1 tradeoff came from the unweighted model:

```text
CLASS_WEIGHT_ALPHA = 0.0
```

## Current Metrics

Held-out 20% stratified test set:

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

Confusion matrix:

```text
              sorghum  sunflower  vineyard  winter_wheat
sorghum           171         44       136             5
sunflower          31        230       118             3
vineyard           30          8      9514             5
winter_wheat        6          2        22            39
```

Interpretation:

- Overall accuracy is high, but it is inflated by the dominant vineyard class.
- Vineyard performance is excellent because the dataset contains many vineyard examples.
- Rare-crop precision is now much better than the binary MLP path.
- Rare-crop recall is still limited because the training set has few examples, especially winter wheat.
- The model is credible as a prototype, but not enough for real agronomic deployment.

## Inference And Recommendation Logic

The model outputs one probability per crop. Scores are saved as percentages:

```text
score_sorghum
score_sunflower
score_vineyard
score_winter_wheat
```

The score files also include:

```text
best_crop
best_score
score_margin
recommendation
```

`best_crop` is the highest-probability crop. `score_margin` is the gap between the top two crop scores.

The app-facing `recommendation` field uses abstention logic:

```text
if best_score >= 55 and score_margin >= 10:
    recommendation = best_crop
else:
    recommendation = "uncertain"
```

This is important because the model should not force a crop recommendation when the probabilities are weak or ambiguous. In a real product, uncertainty is better than a confident bad recommendation.

## Artifacts

Preferred artifacts:

```text
src/model_xgb_multiclass.pkl
data/processed/xgb_multiclass_report.txt
data/processed/confusion_matrix_xgb.csv
data/processed/catalonia_scores_xgb.parquet
data/processed/bavaria_scores_xgb.parquet
data/processed/catalonia_scores.parquet
data/processed/bavaria_scores.parquet
```

The default app files are currently overwritten with XGBoost multiclass scores:

```text
data/processed/catalonia_scores.parquet
data/processed/bavaria_scores.parquet
```

Legacy binary MLP artifacts may still exist for comparison:

```text
src/model_vineyard.pkl
src/model_winter_wheat.pkl
src/model_sunflower.pkl
src/model_sorghum.pkl
src/scaler_*.pkl
```

## Project Structure

```text
.
├── README.md
├── MEETING_NOTES.md
├── vercel.json
├── requirements.txt
├── start.sh
├── app/
│   ├── api/
│   │   ├── main.py               FastAPI backend
│   │   ├── requirements.txt
│   │   └── knowledge_base.md     Chat assistant knowledge base
│   └── frontend/
│       ├── src/
│       │   ├── App.jsx
│       │   ├── constants.js
│       │   └── components/       Header, ParcelMap, DetailPanel, ChatPanel, etc.
│       ├── package.json
│       └── dist/                 Pre-built static assets (committed for Vercel)
├── data/
│   ├── crop_profiles.csv
│   └── processed/
│       ├── catalonia_scores.parquet
│       ├── bavaria_scores.parquet
│       ├── catalonia_features_2023.parquet
│       └── bavaria_features_2023.parquet
├── infra/                        Terraform AWS infrastructure
├── scripts/                      EC2 preprocessing + training scripts
└── src/
    ├── features.py
    └── model_xgb_multiclass.pkl
```

## Reproducing The Pipeline

### 1. Install Local Requirements

```bash
pip install -r requirements.txt
```

### 2. Provision AWS

```bash
cd infra
terraform init
terraform apply
```

The original default instance type may not be available depending on account limits. During this run, AWS allowed `m7i-flex.large`. Keep the instance modest because preprocessing is CPU/disk heavy but not worth burning credits on a very large instance for this prototype.

### 3. Prepare EC2

Copy scripts and inference CSVs:

```bash
scp -i agri-open-eye-key.pem scripts/setup_ec2.sh ubuntu@<EC2_IP>:/home/ubuntu/agri/
scp -i agri-open-eye-key.pem scripts/download_and_process.py ubuntu@<EC2_IP>:/home/ubuntu/agri/
scp -i agri-open-eye-key.pem scripts/process_cached_netcdf_ec2.py ubuntu@<EC2_IP>:/home/ubuntu/agri/
scp -i agri-open-eye-key.pem data/gee_exports/catalonia_2023.csv ubuntu@<EC2_IP>:/home/ubuntu/agri/
scp -i agri-open-eye-key.pem data/gee_exports/bavaria_2023.csv ubuntu@<EC2_IP>:/home/ubuntu/agri/
```

Install packages on EC2:

```bash
ssh -i agri-open-eye-key.pem ubuntu@<EC2_IP>
cd /home/ubuntu/agri
bash setup_ec2.sh
python3 -m pip install --user xarray netCDF4
```

If using a small instance, enable swap before heavy processing:

```bash
sudo fallocate -l 24G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### 4. Download Or Reuse S4A Raw Data

If the HuggingFace cache is already present on EC2, do not redownload it. Process the NetCDF cache directly.

If the cache is missing, populate it with the HuggingFace script using a valid token:

```bash
HF_TOKEN=<token> python3 download_and_process.py
```

Then run direct NetCDF preprocessing:

```bash
python3 process_cached_netcdf_ec2.py --reset
```

This writes:

```text
/home/ubuntu/agri/processed_batches/training_data.csv
s3://agri-open-eye-data/processed/training_data.csv
```

### 5. Sync Results Locally

```bash
aws s3 cp s3://agri-open-eye-data/processed/training_data.csv data/processed/training_data.csv
```

### 6. Train Multiclass XGBoost Locally

```bash
PYTHONPATH=. python3 scripts/train_xgb_multiclass.py
```

This writes model, report, confusion matrix, and score files locally. If Python upload through `boto3` fails because of local network/session configuration, use AWS CLI:

```bash
aws s3 cp src/model_xgb_multiclass.pkl s3://agri-open-eye-data/models/model_xgb_multiclass.pkl
aws s3 cp data/processed/xgb_multiclass_report.txt s3://agri-open-eye-data/processed/xgb_multiclass_report.txt
aws s3 cp data/processed/confusion_matrix_xgb.csv s3://agri-open-eye-data/processed/confusion_matrix_xgb.csv
aws s3 cp data/processed/catalonia_scores.parquet s3://agri-open-eye-data/processed/catalonia_scores.parquet
aws s3 cp data/processed/bavaria_scores.parquet s3://agri-open-eye-data/processed/bavaria_scores.parquet
aws s3 cp data/processed/catalonia_scores_xgb.parquet s3://agri-open-eye-data/processed/catalonia_scores_xgb.parquet
aws s3 cp data/processed/bavaria_scores_xgb.parquet s3://agri-open-eye-data/processed/bavaria_scores_xgb.parquet
```

### 7. Run The App

```bash
./start.sh
```

The app runs on http://localhost:5173 (frontend) and http://localhost:8000 (API).
Add OPENAI_API_KEY to .env to enable chat assistant and AI summaries.

The app reads:

```text
data/processed/catalonia_scores.parquet
data/processed/bavaria_scores.parquet
```

It uses `recommendation` when present, so uncertain low-confidence rows can be displayed separately from confident crop recommendations.

### 8. Stop Or Destroy AWS Resources

If keeping the cached raw data for later, stop EC2:

```bash
aws ec2 stop-instances --region eu-west-1 --instance-ids <INSTANCE_ID>
```

This stops compute charges but keeps EBS storage charges for the 200 GiB volume.

If done permanently, empty S3 and destroy Terraform resources:

```bash
aws s3 rm s3://agri-open-eye-data --recursive
bash infra/destroy.sh
```

## Does The Current Solution Make Sense?

Yes, for an academic prototype. The final structure is coherent:

- raw satellite patches are reduced into parcel-level temporal vegetation features
- expert crop calendars are used as soft feature context
- a multiclass tabular model is used instead of independent binary classifiers
- uncertainty is exposed instead of forcing every row into a crop
- cloud resources are used only for the large preprocessing stage
- local artifacts are small and easy to reproduce once preprocessing is done

The project now matches the data shape. We are not using an unnecessarily complex neural network for a 32-feature tabular problem. We are also not pretending that high overall accuracy alone proves usefulness.

However, it is not optimal for a real agricultural product yet. The current model is a sensible prototype, not a final decision engine.

## Main Limitations

1. Training labels are Catalonia 2019, while inference is Catalonia/Bavaria 2023.
2. Bavaria is a domain-shift test: climate, crop calendars, and management may differ from Catalonia.
3. Vineyard dominates the training data, so rare classes have limited recall.
4. Winter wheat has only 383 processed examples, so its metrics are unstable.
5. Scores estimate class resemblance, not yield, profitability, water demand, or farmer utility.
6. Inference uses grid points, not exact parcel polygons.
7. The model does not yet use soil, weather, irrigation, slope, elevation, or management history.
8. The probability scores are not formally calibrated.
9. The S4A labels are from one year and one region, so generalization is limited.

## Future Improvements

If this project became real, the highest-impact structural changes would be:

- Train on more years and more regions, not only Catalonia 2019.
- Use real parcel geometries for inference instead of grid points.
- Add soil, weather, irrigation, elevation, slope, and historical crop rotation features.
- Validate recommendations against yield or farmer outcome data, not only crop labels.
- Calibrate probabilities so a score of 80 has a clear probabilistic meaning.
- Tune abstention thresholds with a business objective, such as minimizing bad recommendations.
- Build a proper train/validation/test split by geography and year to measure domain shift.
- Try temporal models only after adding enough temporal data to justify them.
- Keep XGBoost or another strong tabular model as the baseline even if neural models are tested.
- Add cost controls for cloud runs: instance budgets, lifecycle rules, and automated shutdown.
- Store raw data and processed artifacts with versioned manifests so experiments are reproducible.
- Rotate any credentials that were used during development and move secrets to a proper secret manager.

## Operational Notes

- Do not overwrite XGBoost score files (`catalonia_scores.parquet`, `bavaria_scores.parquet`) with legacy binary MLP output unless explicitly comparing baselines.
- Watch EC2 disk usage during large preprocessing runs: `df -h /`.
- Terraform `destroy` will fail if S3 bucket is non-empty. Empty the bucket first with `aws s3 rm s3://agri-open-eye-data --recursive`.
- Any credentials used during development should be rotated and moved to a proper secret manager before sharing the repository.

## Report Summary

The project began with a broad idea: use satellite imagery and AI to recommend crops. The main technical challenge turned out to be data engineering, not neural-network design. HuggingFace dataset loading was too heavy for the raw S4A data, but the cached NetCDF files were reusable. Direct NetCDF preprocessing on EC2 turned 77.62 GiB of raw patches into a 44 MiB parcel-level training table.

The first model family, independent one-vs-rest MLPs, proved that the app pipeline could work but gave weak rare-class precision. Synthetic balancing helped recall but increased false positives. Strict literature gates were too brittle. The final solution uses literature-informed features with multiclass XGBoost, which better matches the mutually exclusive crop-label problem and gives a stronger precision/recall tradeoff.

The final system is a reasonable academic prototype for crop suitability scoring from Sentinel-2 time series. It should not be presented as a production agronomic recommendation system until it is validated across years, regions, parcels, and real agricultural outcomes.
