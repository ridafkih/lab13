declare const URLPattern: {
  new (init: {
    pathname: string;
  }): {
    exec(input: {
      pathname: string;
    }): { pathname: { groups: Record<string, string> } } | null;
  };
};

/**
 * Replace :uuid in a template path with the actual value.
 * @example resolvePath("session/:uuid/meta", { uuid: "abc" }) => "session/abc/meta"
 */
export function resolvePath(
  template: string,
  params: Record<string, string>
): string {
  return template.replace(/:(\w+)/g, (_, key) => params[key] ?? _);
}

/**
 * Extract params from a resolved path by matching against a template.
 * Returns null if the resolved path doesn't match the template.
 * @example parsePath("session/:uuid/meta", "session/abc/meta") => { uuid: "abc" }
 */
export function parsePath(
  template: string,
  resolved: string
): Record<string, string> | null {
  const pattern = new URLPattern({ pathname: `/${template}` });
  const match = pattern.exec({ pathname: `/${resolved}` });
  if (!match) {
    return null;
  }
  const groups = Object.fromEntries(Object.entries(match.pathname.groups));
  const parsedGroups: Record<string, string> = {};
  for (const [key, value] of Object.entries(groups)) {
    if (typeof value !== "string") {
      return null;
    }
    parsedGroups[key] = value;
  }
  return parsedGroups;
}

/**
 * Check if a template has any parameters.
 */
export function hasParams(template: string): boolean {
  return template.includes(":");
}
