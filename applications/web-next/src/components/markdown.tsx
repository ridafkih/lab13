"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Streamdown } from "streamdown";
import { File } from "@pierre/diffs/react";
import { cn } from "@/lib/cn";

const components = {
  p: ({ children, className, ...props }: ComponentPropsWithoutRef<"p">) => (
    <p className={cn("leading-relaxed", className)} {...props}>
      {children}
    </p>
  ),

  h1: ({ children, className, ...props }: ComponentPropsWithoutRef<"h1">) => (
    <h1 className={cn("text-lg font-semibold", className)} {...props}>
      {children}
    </h1>
  ),

  h2: ({ children, className, ...props }: ComponentPropsWithoutRef<"h2">) => (
    <h2 className={cn("text-base font-semibold", className)} {...props}>
      {children}
    </h2>
  ),

  h3: ({ children, className, ...props }: ComponentPropsWithoutRef<"h3">) => (
    <h3 className={cn("text-sm font-semibold", className)} {...props}>
      {children}
    </h3>
  ),

  h4: ({ children, className, ...props }: ComponentPropsWithoutRef<"h4">) => (
    <h4 className={cn("text-sm font-medium", className)} {...props}>
      {children}
    </h4>
  ),

  h5: ({ children, className, ...props }: ComponentPropsWithoutRef<"h5">) => (
    <h5 className={cn("text-xs font-medium", className)} {...props}>
      {children}
    </h5>
  ),

  h6: ({ children, className, ...props }: ComponentPropsWithoutRef<"h6">) => (
    <h6 className={cn("text-xs font-medium text-text-secondary", className)} {...props}>
      {children}
    </h6>
  ),

  a: ({ children, className, ...props }: ComponentPropsWithoutRef<"a">) => (
    <a
      className={cn("text-accent underline underline-offset-2 hover:no-underline", className)}
      {...props}
    >
      {children}
    </a>
  ),

  strong: ({ children, className, ...props }: ComponentPropsWithoutRef<"strong">) => (
    <strong className={cn("font-semibold", className)} {...props}>
      {children}
    </strong>
  ),

  em: ({ children, className, ...props }: ComponentPropsWithoutRef<"em">) => (
    <em className={cn("italic", className)} {...props}>
      {children}
    </em>
  ),

  code: ({ children, className, ...props }: ComponentPropsWithoutRef<"code">) => (
    <code className={cn("font-mono text-[0.95em] px-1 py-0.5 bg-border", className)} {...props}>
      {children}
    </code>
  ),

  pre: ({ children }: ComponentPropsWithoutRef<"pre">) => {
    const codeChild = children as ReactNode & { props?: { className?: string; children?: string } };
    const codeClassName = codeChild?.props?.className ?? "";
    const codeContent = codeChild?.props?.children ?? "";

    if (typeof codeContent !== "string") {
      return (
        <pre className="font-mono text-xs p-3 rounded bg-bg-muted overflow-x-auto">{children}</pre>
      );
    }

    const langMatch = codeClassName.match(/language-(\w+)/);
    const lang = langMatch?.[1];

    return (
      <div className="w-0 min-w-full">
        <File
          file={{ name: lang ? `file.${lang}` : "file.txt", contents: codeContent }}
          options={{
            theme: "pierre-light",
            overflow: "scroll",
            disableFileHeader: true,
          }}
          style={{ "--diffs-font-size": "12px" } as React.CSSProperties}
        />
      </div>
    );
  },

  blockquote: ({ children, className, ...props }: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote
      className={cn("border-l-2 border-border pl-3 text-text-secondary italic", className)}
      {...props}
    >
      {children}
    </blockquote>
  ),

  ul: ({ children, className, ...props }: ComponentPropsWithoutRef<"ul">) => (
    <ul className={cn("list-disc pl-4 space-y-1", className)} {...props}>
      {children}
    </ul>
  ),

  ol: ({ children, className, ...props }: ComponentPropsWithoutRef<"ol">) => (
    <ol className={cn("list-decimal pl-4 space-y-1", className)} {...props}>
      {children}
    </ol>
  ),

  li: ({ children, className, ...props }: ComponentPropsWithoutRef<"li">) => (
    <li className={cn("leading-relaxed", className)} {...props}>
      {children}
    </li>
  ),

  hr: ({ className, ...props }: ComponentPropsWithoutRef<"hr">) => (
    <hr className={cn("border-border", className)} {...props} />
  ),

  table: ({ children, className, ...props }: ComponentPropsWithoutRef<"table">) => (
    <div className="overflow-x-auto">
      <table className={cn("w-full text-xs", className)} {...props}>
        {children}
      </table>
    </div>
  ),

  thead: ({ children, className, ...props }: ComponentPropsWithoutRef<"thead">) => (
    <thead className={cn("border-b border-border", className)} {...props}>
      {children}
    </thead>
  ),

  tbody: ({ children, className, ...props }: ComponentPropsWithoutRef<"tbody">) => (
    <tbody className={cn("divide-y divide-border", className)} {...props}>
      {children}
    </tbody>
  ),

  tr: ({ children, className, ...props }: ComponentPropsWithoutRef<"tr">) => (
    <tr className={cn("", className)} {...props}>
      {children}
    </tr>
  ),

  th: ({ children, className, ...props }: ComponentPropsWithoutRef<"th">) => (
    <th className={cn("px-2 py-1.5 text-left font-medium", className)} {...props}>
      {children}
    </th>
  ),

  td: ({ children, className, ...props }: ComponentPropsWithoutRef<"td">) => (
    <td className={cn("px-2 py-1.5", className)} {...props}>
      {children}
    </td>
  ),
};

type MarkdownProps = {
  children: string;
  isStreaming?: boolean;
};

function Markdown({ children, isStreaming = false }: MarkdownProps) {
  return (
    <Streamdown
      className="flex flex-col gap-3"
      mode={isStreaming ? "streaming" : "static"}
      isAnimating={isStreaming}
      components={components}
    >
      {children}
    </Streamdown>
  );
}

export { Markdown };
