"""Markdown rendering for note content."""

from __future__ import annotations

import mistune

_renderer = mistune.create_markdown(
    escape=True,
    plugins=["strikethrough", "table", "task_lists"],
)


def render_markdown(text: str) -> str:
    """Render markdown text to HTML, escaping raw HTML in the source."""
    return _renderer(text)
