# test_bloom_filter.R
# Unit tests for r-analytics/bloom_filter.R
#
# Run (from the project root):
#   Rscript -e 'source("r-analytics/bloom_filter.R"); testthat::test_file("r-analytics/tests/test_bloom_filter.R")'

library(testthat)

test_that("a brand-new item is not flagged", {
  bf <- BloomFilter(size = 10000, hash_count = 5)
  expect_false(bf$check("E001"))
})

test_that("an added item is flagged", {
  bf <- BloomFilter(size = 10000, hash_count = 5)
  bf$add("E001")
  expect_true(bf$check("E001"))
})

test_that("there are no false negatives", {
  bf <- BloomFilter(size = 50000, hash_count = 7)
  ids <- sprintf("E%06d", 0:1999)
  for (eid in ids) bf$add(eid)
  for (eid in ids) expect_true(bf$check(eid), info = paste("False negative for", eid))
})

test_that("add_if_new detects duplicates", {
  bf <- BloomFilter(size = 10000, hash_count = 5)
  expect_true(bf$add_if_new("E001"))
  expect_false(bf$add_if_new("E001"))
  expect_true(bf$add_if_new("E002"))
})

test_that("items_added only counts genuinely new items", {
  bf <- BloomFilter(size = 10000, hash_count = 5)
  bf$add_if_new("E001")
  bf$add_if_new("E001")  # duplicate, should not increment
  bf$add_if_new("E002")
  expect_equal(bf$items_added, 2L)
})

test_that("false-positive rate is small at low fill", {
  bf <- BloomFilter(size = 1000000, hash_count = 5)
  for (i in 0:999) bf$add(sprintf("E%06d", i))
  expect_lt(bf$false_positive_rate(), 0.001)
})
