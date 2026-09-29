"""Tests for the markdown rendering utility."""

from app.utils.markdown import _markdown_head, markdown_to_plain_text, render_markdown


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


def test_markdown_to_plain_text_strips_syntax():
    md = (
        "# Standup\n\n- Shipped **dedup**\n- [ ] Next: [polish](https://x.test)\n\n"
        "| a | b |\n|---|---|\n| 1 | 2 |"
    )
    assert markdown_to_plain_text(md) == "Standup Shipped dedup Next: polish a b 1 2"


def test_markdown_to_plain_text_keeps_escaped_characters_as_text():
    assert markdown_to_plain_text("a < b && c") == "a < b && c"


def test_markdown_to_plain_text_empty():
    assert markdown_to_plain_text("  \n\n ") == ""


def test_markdown_to_plain_text_head_cuts_on_line_boundary():
    md = "intro line that is long\n" + "[docs](https://example.com/" + "x" * 50 + ")"
    assert markdown_to_plain_text(md, max_source_chars=40) == "intro line that is long"


def test_markdown_to_plain_text_head_keeps_text_when_only_newline_is_early():
    md = "#\n" + "word " * 100
    assert markdown_to_plain_text(md, max_source_chars=50).startswith("word word")


def test_markdown_to_plain_text_keeps_inline_punctuation_tight():
    assert markdown_to_plain_text("Hello **world**! Use `npm`, see [docs](http://x).") == (
        "Hello world! Use npm, see docs."
    )


def test_markdown_to_plain_text_keeps_image_alt_text():
    assert markdown_to_plain_text("![diagram of flow](a.png) caption") == "diagram of flow caption"


def test_markdown_head_closes_open_code_fence():
    md = "before\n~~~~\ncode line\n" + "more code\n" * 20 + "~~~~\nafter"
    head = _markdown_head(md, 40)
    assert head == "before\n~~~~\ncode line\nmore code\n~~~~"
    assert markdown_to_plain_text(md, max_source_chars=40) == "before code line more code"


def test_markdown_head_leaves_closed_fences_alone():
    md = "```\ncode\n```\ntext line\n" + "tail " * 20
    assert _markdown_head(md, 30) == "```\ncode\n```\ntext line"


def test_markdown_to_plain_text_head_is_noop_for_short_text():
    assert markdown_to_plain_text("# Title", max_source_chars=100) == "Title"
