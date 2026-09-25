"""
bloom_filter.py
----------------
A simple Bloom Filter used to catch duplicate parking-event IDs in the
Kafka -> PySpark streaming pipeline before they get double-counted in
occupancy aggregations.

Why a Bloom Filter here (and not just a Python set or a DB lookup)?
  - Membership checks are O(hash_count), independent of how many events
    have been seen so far.
  - Memory use is fixed up front (a bit array), rather than growing with
    every unique event_id -- important once you're past a few million
    events.
  - The trade-off: it can return a false positive ("might have seen this
    before" when it hasn't), but it will NEVER return a false negative
    ("definitely new" when it's actually a duplicate). That asymmetry is
    fine for duplicate-suppression: false positives just mean we drop an
    occasional new event, but true duplicates are always caught.

Use in Spark: wrap add()/check() as a Python UDF applied per micro-batch
(see streaming/spark_streaming.py for where this plugs in), or maintain
one filter per streaming query and update it via foreachBatch.
"""

import hashlib


class BloomFilter:
    def __init__(self, size: int = 1_000_000, hash_count: int = 5):
        self.size = size
        self.hash_count = hash_count
        self.bit_array = bytearray(size)  # 1 byte per bit, simple & fast for a demo
        self.items_added = 0

    def _hashes(self, item: str):
        positions = []
        for i in range(self.hash_count):
            digest = hashlib.sha256(f"{item}:{i}".encode()).hexdigest()
            positions.append(int(digest, 16) % self.size)
        return positions

    def add(self, item: str) -> None:
        for pos in self._hashes(item):
            self.bit_array[pos] = 1
        self.items_added += 1

    def check(self, item: str) -> bool:
        """Returns True if the item MIGHT have been seen before (possible
        false positive), False if it is DEFINITELY new (no false negatives)."""
        return all(self.bit_array[pos] for pos in self._hashes(item))

    def add_if_new(self, item: str) -> bool:
        """Convenience helper: returns True if the item was new and has now
        been added, False if it looked like a duplicate."""
        if self.check(item):
            return False
        self.add(item)
        return True

    def estimated_false_positive_rate(self) -> float:
        """Standard Bloom Filter FPR estimate: (1 - e^(-k*n/m))^k"""
        k, n, m = self.hash_count, self.items_added, self.size
        return (1 - pow(2.718281828, -k * n / m)) ** k


if __name__ == "__main__":
    bf = BloomFilter(size=100_000, hash_count=5)

    incoming_event_ids = [
        "E00000001", "E00000002", "E00000003",
        "E00000001",  # duplicate
        "E00000004", "E00000002",  # duplicate
    ]

    print("Processing simulated event stream:")
    for eid in incoming_event_ids:
        is_new = bf.add_if_new(eid)
        status = "PROCESS (new)" if is_new else "SKIP (duplicate)"
        print(f"  {eid}: {status}")

    print(f"\nUnique events added: {bf.items_added}")
    print(f"Estimated false-positive rate at this fill level: {bf.estimated_false_positive_rate():.6%}")
