/**
 * Parses tool output that comes wrapped in <file> tags with line numbers.
 *
 * Input format:
 * <file>
 * 00001| line content
 * 00002| line content
 * </file>
 *
 * Returns the raw content without line numbers.
 */
export function parseFileOutput(output: string): string {
  // Remove <file> wrapper tags
  let content = output.trim();

  if (content.startsWith("<file>")) {
    content = content.slice(6);
  }
  if (content.endsWith("</file>")) {
    content = content.slice(0, -7);
  }

  content = content.trim();

  // Strip line number prefixes (format: "00001| " or "    1\t")
  const lines = content.split("\n");
  const strippedLines = lines.map((line) => {
    // Match "00001| " format (5 digits, pipe, space)
    const pipeMatch = line.match(/^\d{5}\| (.*)$/);
    if (pipeMatch) {
      return pipeMatch[1];
    }

    // Match "    1\t" format (spaces, digits, tab) - cat -n format
    const tabMatch = line.match(/^\s*\d+\t(.*)$/);
    if (tabMatch) {
      return tabMatch[1];
    }

    return line;
  });

  return strippedLines.join("\n");
}
