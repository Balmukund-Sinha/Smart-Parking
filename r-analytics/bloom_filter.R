# bloom_filter.R
# ---------------
# R implementation of a Bloom Filter for duplicate parking-event-id
# detection. This is the R equivalent of streaming/bloom_filter.py, so the
# same "data stream algorithm" experiment (Bloom Filter for membership
# checking) is demonstrated in both languages.
#
# Same trade-off as the Python version: fixed memory footprint (a bit
# vector sized up front), O(hash_count) lookups regardless of how many
# items have been seen, at the cost of a small tunable false-positive
# rate -- but NEVER a false negative. A true duplicate is always caught.
#
# This file only defines the constructor. See bloom_filter_demo.R for a
# runnable demo, and tests/test_bloom_filter.R for unit tests.
#
# Requires: digest (install.packages("digest"))

suppressMessages(library(digest))

BloomFilter <- function(size = 1000000, hash_count = 5) {
  self <- new.env()
  self$size <- size
  self$hash_count <- hash_count
  self$bit_array <- raw(size)       # all-zero bytes = empty filter
  self$items_added <- 0L

  # Derive `hash_count` independent hash positions from one SHA-256 digest
  # per (item, salt) pair -- cheap, and good enough spread for a demo.
  #
  # NOTE: R's strtoi() returns a 32-bit integer, so it silently overflows to
  # NA on hex strings wider than ~8 digits. 7 hex digits (28 bits, max
  # 268,435,455) stays safely inside that range while still giving plenty
  # of spread relative to any realistic filter `size`.
  self$.hashes <- function(item) {
    vapply(seq_len(self$hash_count) - 1L, function(i) {
      h <- digest::digest(paste0(item, ":", i), algo = "sha256", serialize = FALSE)
      (strtoi(substr(h, 1, 7), base = 16L) %% self$size) + 1L  # 1-indexed
    }, integer(1))
  }

  self$add <- function(item) {
    positions <- self$.hashes(item)
    self$bit_array[positions] <- as.raw(1)
    self$items_added <- self$items_added + 1L
    invisible(NULL)
  }

  self$check <- function(item) {
    positions <- self$.hashes(item)
    all(self$bit_array[positions] == as.raw(1))
  }

  # Convenience helper: TRUE if the item was new and has now been added,
  # FALSE if it looked like a duplicate.
  self$add_if_new <- function(item) {
    if (self$check(item)) {
      return(FALSE)
    }
    self$add(item)
    TRUE
  }

  # Standard Bloom Filter false-positive-rate estimate: (1 - e^(-kn/m))^k
  self$false_positive_rate <- function() {
    k <- self$hash_count
    n <- self$items_added
    m <- self$size
    (1 - exp(-k * n / m)) ^ k
  }

  class(self) <- "BloomFilter"
  self
}
