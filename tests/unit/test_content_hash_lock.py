"""Unit tests for content hash lock coordination."""

import threading
import time

from app.utils.content_hash_lock import acquire_content_hash_locks


def test_same_hash_lock_blocks_other_thread():
    acquired = threading.Event()
    wait_times: list[float] = []

    def worker_one():
        with acquire_content_hash_locks(["abc123"]):
            acquired.set()
            time.sleep(0.3)

    def worker_two():
        acquired.wait(timeout=2)
        started = time.monotonic()
        with acquire_content_hash_locks(["abc123"]):
            wait_times.append(time.monotonic() - started)

    t1 = threading.Thread(target=worker_one)
    t2 = threading.Thread(target=worker_two)
    t1.start()
    t2.start()
    t1.join(timeout=2)
    t2.join(timeout=2)

    assert not t1.is_alive()
    assert not t2.is_alive()
    assert wait_times, "worker_two never acquired the lock"
    assert wait_times[0] >= 0.2
