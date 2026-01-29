"use client";

import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  type ReactNode,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
} from "react";
import { cn } from "../utils/cn";
import { Slot } from "../utils/slot";
import { useClickOutside } from "../hooks/use-click-outside";

type DropdownContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  activeIndex: number;
  setActiveIndex: (index: number) => void;
};

const DropdownContext = createContext<DropdownContextValue | null>(null);

function useDropdown() {
  const context = useContext(DropdownContext);
  if (!context) throw new Error("Dropdown components must be used within Dropdown");
  return context;
}

export type DropdownProps = {
  children: ReactNode;
  className?: string;
};

export function Dropdown({ children, className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open);

  return (
    <DropdownContext.Provider value={{ open, setOpen, activeIndex, setActiveIndex }}>
      <div ref={ref} className={cn("relative inline-block", className)}>
        {children}
      </div>
    </DropdownContext.Provider>
  );
}

export type DropdownTriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
};

export function DropdownTrigger({
  className,
  children,
  asChild = false,
  ...props
}: DropdownTriggerProps) {
  const { open, setOpen, setActiveIndex } = useDropdown();

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex(0);
    }
  };

  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      type="button"
      className={cn(!asChild && "inline-flex items-center gap-1", className)}
      onClick={() => setOpen(!open)}
      onKeyDown={handleKeyDown}
      aria-expanded={open}
      aria-haspopup="menu"
      {...props}
    >
      {children}
    </Comp>
  );
}

export type DropdownMenuProps = {
  children: ReactNode;
  className?: string;
};

export function DropdownMenu({ children, className }: DropdownMenuProps) {
  const { open, setOpen, activeIndex, setActiveIndex } = useDropdown();
  const menuRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<HTMLButtonElement[]>([]);

  useEffect(() => {
    if (open && activeIndex >= 0) {
      itemsRef.current[activeIndex]?.focus();
    }
  }, [open, activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const itemCount = itemsRef.current.length;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((activeIndex + 1) % itemCount);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((activeIndex - 1 + itemCount) % itemCount);
        break;
      case "Escape":
        setOpen(false);
        break;
    }
  };

  if (!open) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      className={cn(
        "absolute left-0 top-full z-50 min-w-[8rem] bg-background border border-border shadow-xs",
        className,
      )}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
}

export type DropdownItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
};

export function DropdownItem({ className, icon, children, ...props }: DropdownItemProps) {
  const { setOpen } = useDropdown();

  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        "flex w-full items-center gap-1.5 pl-2 pr-4 py-1.5 text-xs text-left",
        "hover:bg-muted focus:bg-muted focus-visible:outline focus-visible:outline-offset-px focus-visible:outline-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      onClick={(e) => {
        props.onClick?.(e);
        setOpen(false);
      }}
      {...props}
    >
      {icon && <span className="size-3 [&>svg]:size-3">{icon}</span>}
      {children}
    </button>
  );
}

export function DropdownSeparator({ className }: { className?: string }) {
  return <div role="separator" className={cn("h-px bg-border", className)} />;
}
