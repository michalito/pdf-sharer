"""Markdown rendering for note content."""

from __future__ import annotations

import html
import re

import mistune

_renderer = mistune.create_markdown(
    escape=True,
    plugins=["strikethrough", "table", "task_lists"],
)

_TAG_RE = re.compile(r"<[^>]+>")
_INLINE_TAG_RE = re.compile(r"</?(?:a|strong|em|code|del|s|b|i|span|mark|sup|sub)\b[^>]*>")
_IMG_RE = re.compile(r'<img\b[^>]*?\balt="([^"]*)"[^>]*>')
_FENCE_RE = re.compile(r"^ {0,3}(`{3,}|~{3,})")


def render_markdown(text: str) -> str:
    """Render markdown text to HTML, escaping raw HTML in the source."""
    return _renderer(text)


def markdown_to_plain_text(text: str, max_source_chars: int | None = None) -> str:
    """Flatten markdown into single-line readable text (for list previews).

    With ``max_source_chars``, only the head of the source is rendered. The cut moves back to
    the last line break when that keeps at least half the limit, so inline syntax (links,
    emphasis) is usually not split mid-construct.
    """
    if max_source_chars is not None and len(text) > max_source_chars:
        text = _markdown_head(text, max_source_chars)
    rendered = render_markdown(text)
    rendered = _IMG_RE.sub(r" \1 ", rendered)
    # Inline tags vanish so "**world**!" stays "world!"; block tags become word breaks.
    rendered = _INLINE_TAG_RE.sub("", rendered)
    rendered = _TAG_RE.sub(" ", rendered)
    return " ".join(html.unescape(rendered).split())


def _markdown_head(text: str, limit: int) -> str:
    head = text[:limit]
    last_newline = head.rfind("\n")
    if last_newline >= limit // 2:
        head = head[:last_newline]

    # Close a fenced code block left open by the cut so it renders as a finished block.
    open_fence: str | None = None
    for line in head.split("\n"):
        match = _FENCE_RE.match(line)
        if not match:
            continue
        marker = match.group(1)
        if open_fence is None:
            open_fence = marker
        elif (
            marker[0] == open_fence[0]
            and len(marker) >= len(open_fence)
            and not line.strip()[len(marker) :].strip()
        ):
            open_fence = None
    if open_fence is not None:
        head = f"{head}\n{open_fence}"
    return head
