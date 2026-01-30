const port = process.env.MCP_PORT;
if (!port) {
  throw new Error("MCP_PORT environment variable is required");
}

export const config = {
  port: parseInt(port, 10),
};
