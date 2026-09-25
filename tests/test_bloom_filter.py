"""
Unit tests for streaming/bloom_filter.py

Run:
    python -m pytest tests/test_bloom_filter.py -v
    (or just: python tests/test_bloom_filter.py)
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from streaming.bloom_filter import BloomFilter


class TestBloomFilter(unittest.TestCase):
    def test_new_item_not_flagged(self):
        bf = BloomFilter(size=10_000, hash_count=5)
        self.assertFalse(bf.check("E001"))

    def test_added_item_is_flagged(self):
        bf = BloomFilter(size=10_000, hash_count=5)
        bf.add("E001")
        self.assertTrue(bf.check("E001"))

    def test_no_false_negatives(self):
        bf = BloomFilter(size=50_000, hash_count=7)
        ids = [f"E{i:06d}" for i in range(2000)]
        for eid in ids:
            bf.add(eid)
        # Every item that was added MUST be reported as seen.
        for eid in ids:
            self.assertTrue(bf.check(eid), f"False negative for {eid}")

    def test_add_if_new_detects_duplicates(self):
        bf = BloomFilter(size=10_000, hash_count=5)
        self.assertTrue(bf.add_if_new("E001"))
        self.assertFalse(bf.add_if_new("E001"))
        self.assertTrue(bf.add_if_new("E002"))

    def test_items_added_counter(self):
        bf = BloomFilter(size=10_000, hash_count=5)
        bf.add_if_new("E001")
        bf.add_if_new("E001")  # duplicate, should not increment
        bf.add_if_new("E002")
        self.assertEqual(bf.items_added, 2)

    def test_false_positive_rate_reasonable_at_low_fill(self):
        bf = BloomFilter(size=1_000_000, hash_count=5)
        for i in range(1000):
            bf.add(f"E{i:06d}")
        # With only 1000 items in a 1M-bit filter, FPR should be tiny.
        self.assertLess(bf.estimated_false_positive_rate(), 0.001)


if __name__ == "__main__":
    unittest.main()
