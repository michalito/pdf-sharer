"""Tests for the markdown rendering utility."""

from app.utils.markdown import render_markdown


def test_basic_heading():
    assert "<h1>" in render_markdown("# Hello")


def test_bold_text():
    html = render_markdown("**bold**")
    assert "<strong>bold</strong>" in html


def test_inline_code():
    html = render_markdown("`code`")
    assert "<code>code</code>" in html


def test_fenced_code_block():
    md = "```\nprint('hi')\n```"
    html = render_markdown(md)
    assert "<pre>" in html
    assert "<code>" in html


def test_gfm_table():
    md = "| A | B |\n|---|---|\n| 1 | 2 |"
    html = render_markdown(md)
    assert "<table>" in html
    assert "<td>1</td>" in html


def test_escapes_raw_html():
    html = render_markdown('<script>alert("xss")</script>')
    assert "<script>" not in html
    assert "&lt;script&gt;" in html


def test_strikethrough():
    html = render_markdown("~~deleted~~")
    assert "<del>" in html


def test_task_list():
    html = render_markdown("- [x] Done\n- [ ] Todo")
    assert 'type="checkbox"' in html


def test_link():
    html = render_markdown("[click](http://example.com)")
    assert 'href="http://example.com"' in html


def test_blockquote():
    html = render_markdown("> quoted text")
    assert "<blockquote>" in html
