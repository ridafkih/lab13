import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@lab/ui/utils/cn";

type HeadingProps = ComponentPropsWithoutRef<"h1"> & { children?: ReactNode; node?: unknown };
type TextProps = ComponentPropsWithoutRef<"p"> & { children?: ReactNode; node?: unknown };
type LinkProps = ComponentPropsWithoutRef<"a"> & { children?: ReactNode; node?: unknown };
type ListProps = ComponentPropsWithoutRef<"ul"> & { children?: ReactNode; node?: unknown };
type ListItemProps = ComponentPropsWithoutRef<"li"> & { children?: ReactNode; node?: unknown };
type TableProps = ComponentPropsWithoutRef<"table"> & { children?: ReactNode; node?: unknown };
type TableSectionProps = ComponentPropsWithoutRef<"thead"> & {
  children?: ReactNode;
  node?: unknown;
};
type TableRowProps = ComponentPropsWithoutRef<"tr"> & { children?: ReactNode; node?: unknown };
type TableCellProps = ComponentPropsWithoutRef<"td"> & { children?: ReactNode; node?: unknown };
type CodeProps = ComponentPropsWithoutRef<"code"> & { children?: ReactNode; node?: unknown };
type PreProps = ComponentPropsWithoutRef<"pre"> & { children?: ReactNode; node?: unknown };
type BlockquoteProps = ComponentPropsWithoutRef<"blockquote"> & {
  children?: ReactNode;
  node?: unknown;
};
type HrProps = ComponentPropsWithoutRef<"hr"> & { node?: unknown };

const headingBase = "font-sans font-semibold text-foreground tracking-tight";

export const streamdownComponents = {
  h1: ({ className, children, node: _, ...props }: HeadingProps) => (
    <h1 className={cn(headingBase, "text-2xl mt-6 mb-3 first:mt-0", className)} {...props}>
      {children}
    </h1>
  ),
  h2: ({ className, children, node: _, ...props }: HeadingProps) => (
    <h2 className={cn(headingBase, "text-xl mt-5 mb-2 first:mt-0", className)} {...props}>
      {children}
    </h2>
  ),
  h3: ({ className, children, node: _, ...props }: HeadingProps) => (
    <h3 className={cn(headingBase, "text-lg mt-4 mb-2 first:mt-0", className)} {...props}>
      {children}
    </h3>
  ),
  h4: ({ className, children, node: _, ...props }: HeadingProps) => (
    <h4 className={cn(headingBase, "text-base mt-4 mb-1 first:mt-0", className)} {...props}>
      {children}
    </h4>
  ),
  h5: ({ className, children, node: _, ...props }: HeadingProps) => (
    <h5 className={cn(headingBase, "text-sm mt-3 mb-1 first:mt-0", className)} {...props}>
      {children}
    </h5>
  ),
  h6: ({ className, children, node: _, ...props }: HeadingProps) => (
    <h6 className={cn(headingBase, "text-sm mt-3 mb-1 first:mt-0", className)} {...props}>
      {children}
    </h6>
  ),

  p: ({ className, children, node: _, ...props }: TextProps) => (
    <p className={cn("font-sans text-sm text-foreground mb-3 last:mb-0", className)} {...props}>
      {children}
    </p>
  ),

  strong: ({ className, children, node: _, ...props }: TextProps) => (
    <strong className={cn("font-semibold", className)} {...props}>
      {children}
    </strong>
  ),

  em: ({ className, children, node: _, ...props }: TextProps) => (
    <em className={cn("italic", className)} {...props}>
      {children}
    </em>
  ),

  a: ({ className, children, href, node: _, ...props }: LinkProps) => (
    <a
      className={cn("text-primary underline underline-offset-2 hover:text-primary/80", className)}
      href={href}
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
      {...props}
    >
      {children}
    </a>
  ),

  ul: ({ className, children, node: _, ...props }: ListProps) => (
    <ul className={cn("list-disc list-outside ml-4 text-sm mb-3 space-y-1", className)} {...props}>
      {children}
    </ul>
  ),

  ol: ({ className, children, node: _, ...props }: ListProps) => (
    <ol
      className={cn("list-decimal list-outside ml-4 text-sm mb-3 space-y-1", className)}
      {...props}
    >
      {children}
    </ol>
  ),

  li: ({ className, children, node: _, ...props }: ListItemProps) => (
    <li className={cn("text-foreground", className)} {...props}>
      {children}
    </li>
  ),

  blockquote: ({ className, children, node: _, ...props }: BlockquoteProps) => (
    <blockquote
      className={cn(
        "border-l-2 border-border pl-4 my-3 text-sm text-muted-foreground italic",
        className,
      )}
      {...props}
    >
      {children}
    </blockquote>
  ),

  code: ({ className, children, node: _, ...props }: CodeProps) => (
    <code
      className={cn("font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-foreground", className)}
      {...props}
    >
      {children}
    </code>
  ),

  pre: ({ className, children, node: _, ...props }: PreProps) => (
    <pre
      className={cn(
        "font-mono text-xs bg-muted p-3 rounded-md overflow-x-auto my-3 border border-border",
        className,
      )}
      {...props}
    >
      {children}
    </pre>
  ),

  hr: ({ className, node: _, ...props }: HrProps) => (
    <hr className={cn("border-border my-4", className)} {...props} />
  ),

  table: ({ className, children, node: _, ...props }: TableProps) => (
    <div className="overflow-x-auto my-3">
      <table className={cn("w-full text-sm", className)} {...props}>
        {children}
      </table>
    </div>
  ),

  thead: ({ className, children, node: _, ...props }: TableSectionProps) => (
    <thead className={cn("", className)} {...props}>
      {children}
    </thead>
  ),

  tbody: ({ className, children, node: _, ...props }: TableSectionProps) => (
    <tbody className={cn("", className)} {...props}>
      {children}
    </tbody>
  ),

  tr: ({ className, children, node: _, ...props }: TableRowProps) => (
    <tr className={cn("border-b border-border", className)} {...props}>
      {children}
    </tr>
  ),

  th: ({ className, children, node: _, ...props }: TableCellProps) => (
    <th
      className={cn(
        "px-2 py-1.5 text-left text-xs font-medium text-muted-foreground border-b border-border",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  ),

  td: ({ className, children, node: _, ...props }: TableCellProps) => (
    <td className={cn("px-2 py-1.5 text-xs", className)} {...props}>
      {children}
    </td>
  ),
};
