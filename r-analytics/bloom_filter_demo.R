# bloom_filter_demo.R
# Runnable demo of BloomFilter (see bloom_filter.R).
#
# Run (from the project root):
#   Rscript r-analytics/bloom_filter_demo.R

source(file.path("r-analytics", "bloom_filter.R"))

bf <- BloomFilter(size = 100000, hash_count = 5)

incoming_event_ids <- c(
  "E00000001", "E00000002", "E00000003",
  "E00000001",  # duplicate
  "E00000004", "E00000002"  # duplicate
)

cat("Processing simulated event stream:\n")
for (eid in incoming_event_ids) {
  is_new <- bf$add_if_new(eid)
  status <- if (is_new) "PROCESS (new)" else "SKIP (duplicate)"
  cat(sprintf("  %s: %s\n", eid, status))
}

cat(sprintf("\nUnique events added: %d\n", bf$items_added))
cat(sprintf(
  "Estimated false-positive rate at this fill level: %.6f%%\n",
  bf$false_positive_rate() * 100
))
