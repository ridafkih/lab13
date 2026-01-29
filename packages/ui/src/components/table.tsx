import {
  forwardRef,
  type HTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from "react";
import { cn } from "../utils/cn";

type TableProps = HTMLAttributes<HTMLTableElement> & {
  columns?: string;
};

export const Table = forwardRef<HTMLTableElement, TableProps>(
  ({ className, columns, style, ...props }, ref) => (
    <table
      ref={ref}
      className={cn("w-full text-sm", columns && "grid *:contents", className)}
      style={columns ? ({ ...style, gridTemplateColumns: columns } as React.CSSProperties) : style}
      {...props}
    />
  ),
);
Table.displayName = "Table";

export const TableHeader = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => <thead ref={ref} className={className} {...props} />);
TableHeader.displayName = "TableHeader";

export const TableBody = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => <tbody ref={ref} className={className} {...props} />);
TableBody.displayName = "TableBody";

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn("col-span-full grid grid-cols-subgrid last:[&>td]:border-b-0", className)}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

export const TableHead = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "px-2 py-1.5 text-left text-xs font-medium text-muted-foreground border-b border-border",
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

export const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn("px-2 py-1.5 text-xs border-b border-border flex items-center", className)}
      {...props}
    />
  ),
);
TableCell.displayName = "TableCell";
