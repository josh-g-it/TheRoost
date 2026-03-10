import type { ComponentPropsWithoutRef } from "react";
import { memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { stripActions } from "../../../utils/actionParser";
import "./MessageBubble.css";

// Module-scope constants — stable references prevent react-markdown re-processing
export const REMARK_PLUGINS = [remarkGfm];

export const MARKDOWN_COMPONENTS = {
  a: ({ href, children, ...props }: ComponentPropsWithoutRef<"a">) => {
    if (href && /^(javascript|vbscript|data):/i.test(href)) return <>{children}</>;
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    );
  },
  img: () => null,
};

/** Memoized message bubble — skips re-render when id/role/content are unchanged. */
export const MessageBubble = memo(function MessageBubble({
  role,
  content,
}: {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}) {
  return role === "assistant" ? (
    <Markdown remarkPlugins={REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>
      {stripActions(content)}
    </Markdown>
  ) : (
    <>{content}</>
  );
});
