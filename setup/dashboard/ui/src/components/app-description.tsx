import { Fragment, useMemo, type ReactNode } from "react";

// Legacy translations contain markup. Rebuild only supported text formatting
// as React elements, without inserting the source HTML into the live document.
function descriptionNodes(source: string): ReactNode[] {
  const template = document.createElement("template");
  template.innerHTML = source;
  function render(node: Node, key: number): ReactNode {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (!(node instanceof HTMLElement)) return null;
    const tag = node.tagName.toLowerCase();
    if (["script", "style", "iframe", "object", "embed", "svg", "math"].includes(tag)) return null;
    const children = Array.from(node.childNodes, render);
    switch (tag) {
      case "a": {
        const href = node.getAttribute("href") ?? "";
        let url: URL;
        try { url = new URL(href); } catch { return <Fragment key={key}>{children}</Fragment>; }
        if (!["http:", "https:"].includes(url.protocol)) return <Fragment key={key}>{children}</Fragment>;
        return (
          <a key={key} href={url.href} target="_blank" rel="noopener noreferrer"
            className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary">
            {children}
          </a>
        );
      }
      case "br": return <br key={key} />;
      case "b":
      case "strong": return <strong key={key}>{children}</strong>;
      case "i":
      case "em": return <em key={key}>{children}</em>;
      case "code": return <code key={key} className="rounded bg-muted px-1 font-mono">{children}</code>;
      default: return <Fragment key={key}>{children}</Fragment>;
    }
  }
  return Array.from(template.content.childNodes, render);
}

export function AppDescription({ description }: { description: string }) {
  const content = useMemo(() => descriptionNodes(description), [description]);
  return <>{content}</>;
}
