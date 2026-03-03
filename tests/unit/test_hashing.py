"""Unit tests for content hashing utilities."""

import hashlib
import tempfile
from pathlib import Path

from app.utils.hashing import hash_file, hash_string


class TestHashFile:
    def test_known_content(self, tmp_path):
        f = tmp_path / "hello.txt"
        f.write_bytes(b"hello world")
        expected = hashlib.sha256(b"hello world").hexdigest()
        assert hash_file(f) == expected

    def test_empty_file(self, tmp_path):
        f = tmp_path / "empty"
        f.write_bytes(b"")
        expected = hashlib.sha256(b"").hexdigest()
        assert hash_file(f) == expected

    def test_binary_content(self, tmp_path):
        data = bytes(range(256)) * 300  # 76800 bytes, spans multiple chunks
        f = tmp_path / "binary.bin"
        f.write_bytes(data)
        expected = hashlib.sha256(data).hexdigest()
        assert hash_file(f) == expected

    def test_produces_64_char_hex(self, tmp_path):
        f = tmp_path / "test.txt"
        f.write_bytes(b"test")
        result = hash_file(f)
        assert len(result) == 64
        assert all(c in "0123456789abcdef" for c in result)


class TestHashString:
    def test_known_content(self):
        expected = hashlib.sha256(b"hello world").hexdigest()
        assert hash_string("hello world") == expected

    def test_empty_string(self):
        expected = hashlib.sha256(b"").hexdigest()
        assert hash_string("") == expected

    def test_unicode(self):
        text = "caf\u00e9 \u2603"
        expected = hashlib.sha256(text.encode("utf-8")).hexdigest()
        assert hash_string(text) == expected

    def test_same_content_same_hash(self):
        assert hash_string("abc") == hash_string("abc")

    def test_different_content_different_hash(self):
        assert hash_string("abc") != hash_string("def")
