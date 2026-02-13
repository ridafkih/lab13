import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { file } from "bun";

export async function handleFsEntries(url: URL): Promise<Response> {
  const requestedPath = url.searchParams.get("path") ?? "/";

  try {
    const entries = await readdir(requestedPath, { withFileTypes: true });

    const result = entries.map((entry) => ({
      name: entry.name,
      path: join(requestedPath, entry.name),
      entryType: entry.isDirectory() ? "directory" : "file",
    }));

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function handleFsFile(url: URL): Promise<Response> {
  const filePath = url.searchParams.get("path");
  if (!filePath) {
    return Response.json({ error: "Missing path parameter" }, { status: 400 });
  }

  try {
    const bunFile = file(filePath);
    const exists = await bunFile.exists();
    if (!exists) {
      return Response.json({ error: "File not found" }, { status: 404 });
    }

    const bytes = await bunFile.arrayBuffer();
    return new Response(bytes, {
      headers: {
        "Content-Type": bunFile.type || "application/octet-stream",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
