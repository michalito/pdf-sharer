import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const components: Components = {
  img: ({ src, alt, title }) => {
    if (!src) return null;
    return (
      <img
        src={src}
        alt={alt || ""}
        title={title || undefined}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
      />
    );
  },
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

export default function MarkdownProse({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={`md-prose ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
