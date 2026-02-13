export function getString(input: unknown, key: string): string | undefined {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }
  const value = Object.fromEntries(Object.entries(input))[key];
  return typeof value === "string" ? value : undefined;
}

export function getArray<T>(input: unknown, key: string): T[] | undefined {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }
  const value = Object.fromEntries(Object.entries(input))[key];
  return Array.isArray(value) ? value : undefined;
}
