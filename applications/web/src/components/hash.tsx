type HashProps = {
  children: string;
};

export function Hash({ children }: HashProps) {
  return <span className="text-text-muted text-xs">{children}</span>;
}
