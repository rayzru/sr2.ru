import { Fragment, type ReactNode } from "react";

import type { JSONContent } from "@tiptap/react";

import type { RichRendererProps } from "~/lib/editor";
import { logger } from "~/lib/logger";
import { cn } from "~/lib/utils";

import {
  Blockquote,
  BulletList,
  CodeBlock,
  HardBreak,
  Heading,
  HorizontalRule,
  ImageNode,
  ListItem,
  MentionNode,
  OrderedList,
  Paragraph,
  ReferenceCardNode,
  renderMark,
  YoutubeNode,
} from "./node-renderers";

// ============================================================================
// SSR Content Renderer
// ============================================================================

/**
 * Server-side renderer for TipTap JSON content
 * Can be used in Server Components without loading TipTap
 */
export function RichRenderer({ content, className }: RichRendererProps) {
  if (!content?.content) {
    return null;
  }

  return (
    <div className={cn("prose prose-sm dark:prose-invert max-w-none", className)}>
      {renderNodes(content.content)}
    </div>
  );
}

// ============================================================================
// Node Rendering Logic
// ============================================================================

function renderNodes(nodes: JSONContent[]): ReactNode {
  return nodes.map((node, index) => <Fragment key={index}>{renderNode(node)}</Fragment>);
}

function renderNode(node: JSONContent): ReactNode {
  const renderChildren = (children: JSONContent[]) => renderNodes(children);

  switch (node.type) {
    // Text node with marks
    case "text":
      return renderTextNode(node);

    // Block nodes
    case "paragraph":
      return <Paragraph node={node} renderChildren={renderChildren} />;

    case "heading":
      return <Heading node={node} renderChildren={renderChildren} />;

    case "bulletList":
      return <BulletList node={node} renderChildren={renderChildren} />;

    case "orderedList":
      return <OrderedList node={node} renderChildren={renderChildren} />;

    case "listItem":
      return <ListItem node={node} renderChildren={renderChildren} />;

    case "blockquote":
      return <Blockquote node={node} renderChildren={renderChildren} />;

    case "codeBlock":
      return <CodeBlock node={node} renderChildren={renderChildren} />;

    case "horizontalRule":
      return <HorizontalRule />;

    case "hardBreak":
      return <HardBreak />;

    // Media nodes
    case "image":
      return <ImageNode node={node} />;

    case "youtube":
      return <YoutubeNode node={node} />;

    // Custom nodes
    case "mention":
      return <MentionNode node={node} />;

    case "referenceCard":
      return <ReferenceCardNode node={node} />;

    // Document root
    case "doc":
      return node.content ? renderNodes(node.content) : null;

    // Unknown node type - render children if any
    default:
      logger.warn(`Unknown node type: ${node.type}`);
      return node.content ? renderNodes(node.content) : null;
  }
}

function renderTextNode(node: JSONContent): ReactNode {
  if (!node.text) return null;

  let result: ReactNode = node.text;

  // Apply marks in reverse order (innermost first)
  if (node.marks && node.marks.length > 0) {
    for (const mark of [...node.marks].reverse()) {
      result = renderMark({
        mark: mark as { type: string; attrs?: Record<string, unknown> },
        children: result,
      });
    }
  }

  return result;
}

// ============================================================================
// Utility Components
// ============================================================================

/**
 * Inline renderer for short content (e.g., in lists, previews)
 * Renders without block-level styling
 */
export function RichInlineRenderer({ content, className }: RichRendererProps) {
  if (!content?.content) {
    return null;
  }

  // Extract text content from first paragraph only
  const firstParagraph = content.content.find((n) => n.type === "paragraph");
  if (!firstParagraph?.content) {
    return null;
  }

  return <span className={className}>{renderNodes(firstParagraph.content)}</span>;
}

/**
 * Preview renderer - renders limited content with ellipsis
 */
export function RichPreviewRenderer({
  content,
  maxLength = 200,
  className,
}: RichRendererProps & { maxLength?: number }) {
  if (!content?.content) {
    return null;
  }

  // Extract plain text
  const plainText = extractText(content);
  const truncated =
    plainText.length > maxLength ? plainText.slice(0, maxLength).trim() + "..." : plainText;

  return <p className={cn("text-muted-foreground", className)}>{truncated}</p>;
}

function extractText(content: JSONContent): string {
  const parts: string[] = [];

  function traverse(node: JSONContent) {
    if (node.text) {
      parts.push(node.text);
    }
    if (node.content) {
      for (const child of node.content) {
        traverse(child);
      }
    }
  }

  traverse(content);
  return parts.join(" ");
}
