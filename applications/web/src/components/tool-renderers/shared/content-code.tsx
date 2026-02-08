"use client";

import { File } from "@pierre/diffs/react";

const pierreThemes = { light: "pierre-light", dark: "pierre-dark" } as const;

const extensionToLanguage: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "bash",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  html: "html",
  css: "css",
  scss: "scss",
  less: "less",
  md: "markdown",
  sql: "sql",
  graphql: "graphql",
  dockerfile: "dockerfile",
  makefile: "makefile",
};

function inferLanguage(filename?: string): string | undefined {
  if (!filename) return undefined;
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext) return undefined;
  return extensionToLanguage[ext];
}

type ContentCodeProps = {
  content: string;
  filename?: string;
  language?: string;
};

function ContentCode({ content, filename, language }: ContentCodeProps) {
  const effectiveLanguage = language ?? inferLanguage(filename);
  const displayFilename =
    filename ?? (effectiveLanguage ? `file.${effectiveLanguage}` : "file.txt");

  return (
    <div className="w-0 min-w-full">
      <File
        file={{ name: displayFilename, contents: content }}
        options={{
          theme: pierreThemes,
          themeType: "system",
          overflow: "scroll",
          disableFileHeader: true,
        }}
        style={{ "--diffs-font-size": "12px" } as React.CSSProperties}
      />
    </div>
  );
}

export { ContentCode };
