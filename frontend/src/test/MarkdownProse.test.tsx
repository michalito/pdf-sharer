import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import MarkdownProse from "../components/MarkdownProse";

describe("MarkdownProse", () => {
  it("renders bold text", () => {
    render(<MarkdownProse content="**bold text**" />);
    const el = screen.getByText("bold text");
    expect(el.tagName).toBe("STRONG");
  });

  it("renders images with safe defaults", () => {
    render(<MarkdownProse content={'![diagram](http://example.com/img.png "System diagram")'} />);
    const image = screen.getByRole("img", { name: "diagram" });
    expect(image).toHaveAttribute("src", "http://example.com/img.png");
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("decoding", "async");
    expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(image).toHaveAttribute("title", "System diagram");
  });

  it("opens links in new tab", () => {
    render(<MarkdownProse content="[click](http://example.com)" />);
    const link = screen.getByRole("link", { name: "click" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("applies md-prose class", () => {
    const { container } = render(<MarkdownProse content="hello" />);
    expect(container.firstChild).toHaveClass("md-prose");
  });

  it("appends custom className", () => {
    const { container } = render(<MarkdownProse content="hello" className="extra" />);
    expect(container.firstChild).toHaveClass("md-prose");
    expect(container.firstChild).toHaveClass("extra");
  });

  it("renders headings", () => {
    render(<MarkdownProse content="# Title" />);
    expect(screen.getByRole("heading", { level: 1, name: "Title" })).toBeInTheDocument();
  });

  it("renders code blocks", () => {
    const { container } = render(<MarkdownProse content={"```\ncode\n```"} />);
    expect(container.querySelector("pre")).toBeInTheDocument();
    expect(container.querySelector("code")).toBeInTheDocument();
  });
});
