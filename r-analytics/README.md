# r-analytics/ — R Track

This folder is a parallel, R-native implementation of the analytics, ML,
database, and dashboard layers of the Smart Urban Parking Intelligence
project — same data, same questions, different language. Data generation
and the Kafka/PySpark streaming pipeline remain in Python (`scripts/`,
`kafka/`, `streaming/`); this is the R side of the same BDA project,
covering statistical analysis, modeling, and visualization.

> **Heads up:** this R code was written carefully by hand but has **not**
> been executed (R isn't available in the environment this project was
> built in). Run `Rscript r-analytics/install_packages.R` first, then work
> through the scripts below in order — if you hit a dependency-version
> quirk on the first run, that's normal for any R environment and usually
> a one-line fix (check the error message, it's almost always a missing
> package or an outdated one).

## Setup

```r
# from an R console, or:
Rscript r-analytics/install_packages.R
```

## Run order (from the project root)

```bash
# 0. Make sure the dataset already exists (Python step, see main README)
python scripts/generate_dataset.py

# 1. Bloom Filter demo + tests
Rscript r-analytics/bloom_filter_demo.R
Rscript -e 'source("r-analytics/bloom_filter.R"); testthat::test_file("r-analytics/tests/test_bloom_filter.R")'

# 2. Analytics
Rscript r-analytics/eda.R
Rscript r-analytics/occupancy_analysis.R
Rscript r-analytics/peak_hours.R
Rscript r-analytics/zone_analysis.R

# 3. ML: train the Random Forest, then run a single-example prediction
Rscript r-analytics/train_model.R
Rscript r-analytics/predict.R

# 4. Dashboard
R -e "shiny::runApp('r-analytics/shiny_dashboard')"

# 5. (optional) Load summary tables into PostgreSQL
export PARKING_DB_PASSWORD=postgres
Rscript r-analytics/db_load.R --load-all

# 6. (optional) Knit the full analysis report to HTML
Rscript -e 'rmarkdown::render("r-analytics/report/bda_analysis_report.Rmd", knit_root_dir = "../..")'
```

## What's here

| File | Python equivalent | Purpose |
|---|---|---|
| `bloom_filter.R` / `bloom_filter_demo.R` | `streaming/bloom_filter.py` | Duplicate event-ID detection |
| `tests/test_bloom_filter.R` | `tests/test_bloom_filter.py` | testthat unit tests |
| `eda.R` | `analytics/eda.py` | Exploratory analysis |
| `occupancy_analysis.R` | `analytics/occupancy_analysis.py` | Cleaning + occupancy stats |
| `peak_hours.R` | `analytics/peak_hours.py` | Busiest hours, overall + per zone |
| `zone_analysis.R` | `analytics/zone_analysis.py` | Utilization ranking, avg duration |
| `train_model.R` | `ml/train_model.py` | Random Forest, same features/target |
| `predict.R` | `ml/predict.py` | Single-example prediction demo |
| `db_load.R` | `database/db.py` | Loads summaries into PostgreSQL |
| `shiny_dashboard/app.R` | `dashboard/app.py` | 5-tab live dashboard |
| `report/bda_analysis_report.Rmd` | — | Knittable HTML report (EDA + ML) |

The R model writes its own `data/processed/predictions_r.csv` (rather than overwriting the Python model's `predictions.csv`), so both pipelines' outputs coexist and the Shiny dashboard prefers the R predictions automatically if present.
