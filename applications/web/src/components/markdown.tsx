"use client";

import { File } from "@pierre/diffs/react";
import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";
import { isValidElement } from "react";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/cn";

const pierreThemes = { light: "pierre-light", dark: "pierre-dark" } as const;
type PierreFileStyle = CSSProperties & { "--diffs-font-size"?: string };
const pierreFileStyle: PierreFileStyle = { "--diffs-font-size": "12px" };

function CodeBlock({
  content,
  language,
}: {
  content: string;
  language?: string;
}) {
  return (
    <div className="w-0 min-w-full">
      <File
        file={{
          name: language ? `file.${language}` : "file.txt",
          contents: content,
        }}
        options={{
          theme: pierreThemes,
          themeType: "system",
          overflow: "scroll",
          disableFileHeader: true,
        }}
        style={pierreFileStyle}
      />
    </div>
  );
}

function P({ children, className, ...props }: ComponentPropsWithoutRef<"p">) {
  return (
    <p className={cn("leading-relaxed", className)} {...props}>
      {children}
    </p>
  );
}

function H1({ children, className, ...props }: ComponentPropsWithoutRef<"h1">) {
  return (
    <h1 className={cn("font-semibold text-lg", className)} {...props}>
      {children}
    </h1>
  );
}

function H2({ children, className, ...props }: ComponentPropsWithoutRef<"h2">) {
  return (
    <h2 className={cn("font-semibold text-base", className)} {...props}>
      {children}
    </h2>
  );
}

function H3({ children, className, ...props }: ComponentPropsWithoutRef<"h3">) {
  return (
    <h3 className={cn("font-semibold text-sm", className)} {...props}>
      {children}
    </h3>
  );
}

function H4({ children, className, ...props }: ComponentPropsWithoutRef<"h4">) {
  return (
    <h4 className={cn("font-medium text-sm", className)} {...props}>
      {children}
    </h4>
  );
}

function H5({ children, className, ...props }: ComponentPropsWithoutRef<"h5">) {
  return (
    <h5 className={cn("font-medium text-xs", className)} {...props}>
      {children}
    </h5>
  );
}

function H6({ children, className, ...props }: ComponentPropsWithoutRef<"h6">) {
  return (
    <h6
      className={cn("font-medium text-text-secondary text-xs", className)}
      {...props}
    >
      {children}
    </h6>
  );
}

function A({ children, className, ...props }: ComponentPropsWithoutRef<"a">) {
  return (
    <a
      className={cn(
        "text-accent underline underline-offset-2 hover:no-underline",
        className
      )}
      {...props}
    >
      {children}
    </a>
  );
}

function Strong({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"strong">) {
  return (
    <strong className={cn("font-semibold", className)} {...props}>
      {children}
    </strong>
  );
}

function Em({ children, className, ...props }: ComponentPropsWithoutRef<"em">) {
  return (
    <em className={cn("italic", className)} {...props}>
      {children}
    </em>
  );
}

function Code({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"code">) {
  return (
    <code
      className={cn("bg-border px-1 py-0.5 font-mono text-[0.95em]", className)}
      {...props}
    >
      {children}
    </code>
  );
}

const languageRegex = /language-(\w+)/;

function getCodeProps(children: ReactNode): {
  className: string;
  content: string | null;
} {
  if (!isValidElement(children)) {
    return { className: "", content: null };
  }
  const childProps = children.props;
  if (typeof childProps !== "object" || childProps === null) {
    return { className: "", content: null };
  }
  const propsRecord = Object.fromEntries(Object.entries(childProps));
  const className =
    typeof propsRecord.className === "string" ? propsRecord.className : "";
  const content =
    typeof propsRecord.children === "string" ? propsRecord.children : null;
  return { className, content };
}

function Pre({ children }: ComponentPropsWithoutRef<"pre">) {
  const { className: codeClassName, content: codeContent } =
    getCodeProps(children);

  if (codeContent === null) {
    return (
      <pre className="overflow-x-auto rounded bg-bg-muted p-3 font-mono text-xs">
        {children}
      </pre>
    );
  }

  const langMatch = codeClassName.match(languageRegex);
  const lang = langMatch?.[1];

  return <CodeBlock content={codeContent} language={lang} />;
}

function Blockquote({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"blockquote">) {
  return (
    <blockquote
      className={cn(
        "border-border border-l-2 pl-3 text-text-secondary italic",
        className
      )}
      {...props}
    >
      {children}
    </blockquote>
  );
}

function Ul({ children, className, ...props }: ComponentPropsWithoutRef<"ul">) {
  return (
    <ul className={cn("list-disc space-y-1 pl-4", className)} {...props}>
      {children}
    </ul>
  );
}

function Ol({ children, className, ...props }: ComponentPropsWithoutRef<"ol">) {
  return (
    <ol className={cn("list-decimal space-y-1 pl-4", className)} {...props}>
      {children}
    </ol>
  );
}

function Li({ children, className, ...props }: ComponentPropsWithoutRef<"li">) {
  return (
    <li className={cn("leading-relaxed", className)} {...props}>
      {children}
    </li>
  );
}

function Hr({ className, ...props }: ComponentPropsWithoutRef<"hr">) {
  return <hr className={cn("border-border", className)} {...props} />;
}

function Table({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"table">) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full text-xs", className)} {...props}>
        {children}
      </table>
    </div>
  );
}

function Thead({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"thead">) {
  return (
    <thead className={cn("border-border border-b", className)} {...props}>
      {children}
    </thead>
  );
}

function Tbody({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"tbody">) {
  return (
    <tbody className={cn("divide-y divide-border", className)} {...props}>
      {children}
    </tbody>
  );
}

function Tr({ children, className, ...props }: ComponentPropsWithoutRef<"tr">) {
  return (
    <tr className={cn("", className)} {...props}>
      {children}
    </tr>
  );
}

function Th({ children, className, ...props }: ComponentPropsWithoutRef<"th">) {
  return (
    <th
      className={cn("px-2 py-1.5 text-left font-medium", className)}
      {...props}
    >
      {children}
    </th>
  );
}

function Td({ children, className, ...props }: ComponentPropsWithoutRef<"td">) {
  return (
    <td className={cn("px-2 py-1.5", className)} {...props}>
      {children}
    </td>
  );
}

const components = {
  p: P,
  h1: H1,
  h2: H2,
  h3: H3,
  h4: H4,
  h5: H5,
  h6: H6,
  a: A,
  strong: Strong,
  em: Em,
  code: Code,
  pre: Pre,
  blockquote: Blockquote,
  ul: Ul,
  ol: Ol,
  li: Li,
  hr: Hr,
  table: Table,
  thead: Thead,
  tbody: Tbody,
  tr: Tr,
  th: Th,
  td: Td,
};

interface MarkdownProps {
  children: string;
  isStreaming?: boolean;
}

function Markdown({ children, isStreaming = false }: MarkdownProps) {
  return (
    <Streamdown
      className="flex flex-col gap-3"
      components={components}
      isAnimating={isStreaming}
      mode={isStreaming ? "streaming" : "static"}
    >
      {children}
    </Streamdown>
  );
}

export { Markdown };
