"use client";

import {
  useState,
  type ReactNode,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { tv } from "tailwind-variants";
import { Eye, EyeOff, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

const label = tv({
  base: "text-xs text-text-secondary",
});

function FormInputLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <label className={label()}>
      {children}
      {required && <span className="text-text-muted ml-0.5">*</span>}
    </label>
  );
}

const input = tv({
  base: "w-full px-2 py-1 text-xs bg-bg border border-border text-text placeholder:text-text-muted focus:outline-none focus:border-text-muted",
});

type FormInputTextProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  type?: "text" | "email" | "url";
};

function FormInputText({ type = "text", className, ...props }: FormInputTextProps) {
  return <input type={type} className={input({ className })} {...props} />;
}

function FormInputPassword({
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        className={input({ className: cn("pr-7", className) })}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
      >
        {visible ? <EyeOff size={12} /> : <Eye size={12} />}
      </button>
    </div>
  );
}

type SelectOption = {
  value: string;
  label: string;
};

type FormInputSelectProps = {
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
};

function FormInputSelect({
  options,
  value,
  onChange,
  placeholder,
  className,
}: FormInputSelectProps) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={({ target }) => onChange?.(target.value)}
        className={cn(input(), "appearance-none pr-6 cursor-pointer border-0", className)}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-bg text-text">
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
      />
    </div>
  );
}

type FormInputCheckboxProps = {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
};

function FormInputCheckbox({ checked = false, onChange, label }: FormInputCheckboxProps) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked)}
        className="w-3 h-3 accent-text cursor-pointer"
      />
      {label && <span className="text-xs text-text">{label}</span>}
    </label>
  );
}

function FormInputTextarea({
  className,
  rows = 3,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { rows?: number }) {
  return <textarea rows={rows} className={cn(input(), "resize-none", className)} {...props} />;
}

function FormInputHelper({ children }: { children: ReactNode }) {
  return <p className="text-xs text-text-muted">{children}</p>;
}

function FormInputError({ children }: { children: ReactNode }) {
  return <p className="text-xs text-red-500">{children}</p>;
}

function FormInputSuccess({ children }: { children: ReactNode }) {
  return <p className="text-xs text-green-500">{children}</p>;
}

const submitButton = tv({
  base: "px-2 py-1 text-xs border border-border text-text hover:bg-bg-muted disabled:opacity-50 disabled:cursor-not-allowed",
});

type FormInputSubmitProps = {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  className?: string;
};

function FormInputSubmit({
  children,
  onClick,
  disabled,
  loading,
  loadingText,
  className,
}: FormInputSubmitProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={submitButton({ className })}
    >
      {loading ? (loadingText ?? "Loading...") : children}
    </button>
  );
}

const inputGroup = tv({
  slots: {
    root: "flex items-center border border-border bg-bg focus-within:border-text-muted",
    input:
      "flex-1 min-w-0 px-2 py-1 text-xs bg-transparent text-text placeholder:text-text-muted focus:outline-none",
    separator: "text-xs text-text-muted select-none",
    action: "px-1.5 text-text-muted hover:text-text shrink-0",
  },
});

function InputGroupRoot({ children, className }: { children: ReactNode; className?: string }) {
  const styles = inputGroup();
  return <div className={cn(styles.root(), className)}>{children}</div>;
}

function InputGroupInput({
  className,
  type = "text",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const styles = inputGroup();
  return <input type={type} className={cn(styles.input(), className)} {...props} />;
}

function InputGroupSeparator({ children }: { children: ReactNode }) {
  const styles = inputGroup();
  return <span className={styles.separator()}>{children}</span>;
}

function InputGroupAction({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  const styles = inputGroup();
  return (
    <button type="button" onClick={onClick} className={cn(styles.action(), className)}>
      {children}
    </button>
  );
}

const InputGroup = {
  Root: InputGroupRoot,
  Input: InputGroupInput,
  Separator: InputGroupSeparator,
  Action: InputGroupAction,
};

const FormInput = {
  Label: FormInputLabel,
  Text: FormInputText,
  Textarea: FormInputTextarea,
  Password: FormInputPassword,
  Select: FormInputSelect,
  Checkbox: FormInputCheckbox,
  Helper: FormInputHelper,
  Error: FormInputError,
  Success: FormInputSuccess,
  Submit: FormInputSubmit,
};

export { FormInput, InputGroup };
