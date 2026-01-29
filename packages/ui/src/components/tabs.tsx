"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import { cn } from "../utils/cn";
import { useControllable } from "../hooks/use-controllable";

type TabsContextValue = {
  value: string | undefined;
  setValue: (value: string) => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs() {
  const context = useContext(TabsContext);
  if (!context) throw new Error("Tabs components must be used within Tabs");
  return context;
}

export type TabsProps = {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
};

export function Tabs({
  value: controlledValue,
  defaultValue,
  onValueChange,
  children,
  className,
}: TabsProps) {
  const [value, setValue] = useControllable({
    value: controlledValue,
    defaultValue,
    onChange: onValueChange,
  });

  return (
    <TabsContext.Provider value={{ value, setValue }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export type TabsListProps = {
  children: ReactNode;
  className?: string;
};

export function TabsList({ children, className }: TabsListProps) {
  return (
    <div
      role="tablist"
      className={cn("grid grid-cols-[1fr_1fr] h-8 border-b border-border", className)}
    >
      {children}
    </div>
  );
}

export type TabsTriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  value: string;
};

export function TabsTrigger({ value, className, children, disabled, ...props }: TabsTriggerProps) {
  const { value: selectedValue, setValue } = useTabs();
  const isSelected = value === selectedValue;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isSelected}
      tabIndex={isSelected ? 0 : -1}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 px-3 py-1 text-xs",
        "focus-visible:outline focus-visible:outline-offset-px focus-visible:outline-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        isSelected
          ? "bg-background text-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/70",
        className,
      )}
      onClick={() => setValue(value)}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

export type TabsContentProps = {
  value: string;
  children: ReactNode;
  className?: string;
  lazy?: boolean;
};

export function TabsContent({ value, children, className, lazy = false }: TabsContentProps) {
  const { value: selectedValue } = useTabs();
  const [hasRendered, setHasRendered] = useState(false);
  const isSelected = value === selectedValue;

  if (isSelected && !hasRendered) {
    setHasRendered(true);
  }

  if (lazy && !hasRendered) return null;
  if (!isSelected) return null;

  return (
    <div role="tabpanel" className={className}>
      {children}
    </div>
  );
}
