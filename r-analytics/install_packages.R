# install_packages.R
# Installs every R package used across r-analytics/.
#
# Run once (from anywhere):
#   Rscript r-analytics/install_packages.R

packages <- c(
  "dplyr", "ggplot2", "lubridate",   # data wrangling + EDA
  "randomForest",                     # ML model
  "shiny", "plotly", "leaflet",       # dashboard
  "DBI", "RPostgres",                 # database
  "digest",                            # bloom filter hashing
  "testthat",                          # unit tests
  "rmarkdown", "knitr"                 # report
)

installed <- rownames(installed.packages())
to_install <- setdiff(packages, installed)

if (length(to_install) > 0) {
  install.packages(to_install, repos = "https://cloud.r-project.org")
} else {
  message("All required packages are already installed.")
}
