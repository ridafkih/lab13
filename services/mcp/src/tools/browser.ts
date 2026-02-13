import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  type BrowserCommand,
  executeCommand as baseExecuteCommand,
  type CommandResult,
} from "@lab/browser-protocol";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import type { Config, ToolContext } from "../types/tool";
import {
  type CommandNode,
  createHierarchicalTool,
  type ToolResult,
} from "../utils/hierarchical-tool";
import { resolveBoundLabSessionId } from "../utils/session-binding";

function createS3Client(config: Config): S3Client {
  return new S3Client({
    endpoint: config.RUSTFS_ENDPOINT,
    region: config.RUSTFS_REGION,
    credentials: {
      accessKeyId: config.RUSTFS_ACCESS_KEY,
      secretAccessKey: config.RUSTFS_SECRET_KEY,
    },
    forcePathStyle: true,
  });
}

function errorResult(message: string): ToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: `Error: ${message}` }],
  };
}

function handleResult(result: CommandResult): ToolResult {
  if (!result.success) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error: ${result.error || "Unknown error"}`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text:
          typeof result.data === "string"
            ? result.data
            : JSON.stringify(result.data, null, 2),
      },
    ],
  };
}

export function browser(server: McpServer, { config }: ToolContext) {
  function executeCommand(
    sessionId: string,
    command: BrowserCommand
  ): Promise<CommandResult> {
    return baseExecuteCommand(config.BROWSER_DAEMON_URL, sessionId, command);
  }

  async function uploadToRustFS(
    data: Buffer,
    filename: string,
    contentType = "image/png"
  ): Promise<string> {
    const s3 = createS3Client(config);

    await s3.send(
      new PutObjectCommand({
        Bucket: config.RUSTFS_BUCKET,
        Key: filename,
        Body: data,
        ContentType: contentType,
      })
    );

    return `${config.RUSTFS_PUBLIC_URL}/${config.RUSTFS_BUCKET}/${filename}`;
  }

  async function handleScreenshotResult(
    sessionId: string,
    result: CommandResult
  ): Promise<ToolResult> {
    if (!result.success) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error: ${result.error || "Failed to capture screenshot"}`,
          },
        ],
      };
    }

    const data = result.data;
    const base64 =
      typeof data === "object" &&
      data !== null &&
      "base64" in data &&
      typeof data.base64 === "string"
        ? data.base64
        : null;

    if (!base64) {
      return {
        isError: true,
        content: [
          { type: "text", text: "Error: Screenshot data not returned" },
        ],
      };
    }

    const buffer = Buffer.from(base64, "base64");
    const timestamp = Date.now();
    const filename = `${sessionId}/${timestamp}.png`;

    try {
      const url = await uploadToRustFS(buffer, filename);
      return {
        content: [
          { type: "image", data: base64, mimeType: "image/png" },
          {
            type: "text",
            text: `Screenshot captured successfully and available at ${url}`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error: Failed to upload screenshot: ${message}`,
          },
        ],
      };
    }
  }

  async function handleRecordingStopResult(
    sessionId: string,
    result: CommandResult
  ): Promise<ToolResult> {
    if (!result.success) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error: ${result.error || "Failed to stop recording"}`,
          },
        ],
      };
    }

    const data =
      typeof result.data === "object" && result.data !== null
        ? Object.fromEntries(Object.entries(result.data))
        : null;
    const base64 = data && typeof data.base64 === "string" ? data.base64 : null;

    if (!base64) {
      return {
        isError: true,
        content: [{ type: "text", text: "Error: Recording data not returned" }],
      };
    }

    const buffer = Buffer.from(base64, "base64");
    const capturedFrames =
      data && typeof data.frames === "number" ? data.frames : "unknown";
    const timestamp = Date.now();
    const filename = `${sessionId}/recording-${timestamp}.webm`;

    try {
      const url = await uploadToRustFS(buffer, filename, "video/webm");
      return {
        content: [
          {
            type: "text",
            text: `Recording stopped successfully. Frames captured: ${capturedFrames}. Video available at ${url}`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error: Failed to upload recording: ${message}`,
          },
        ],
      };
    }
  }

  function simpleHandler(
    action: string,
    requiredParams: string[] = [],
    paramMapping?: Record<string, string>
  ): CommandNode["handler"] {
    return async (args, ctx) => {
      for (const param of requiredParams) {
        if (args[param] === undefined) {
          return errorResult(`'${param}' is required for ${action}`);
        }
      }

      const extra: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(args)) {
        const mappedKey = paramMapping?.[key] ?? key;
        extra[mappedKey] = value;
      }

      const command: BrowserCommand = {
        id: ctx.generateCommandId(),
        action,
        ...extra,
      };

      const result = await executeCommand(ctx.sessionId, command);
      return handleResult(result);
    };
  }

  function screenshotHandler(): CommandNode["handler"] {
    return async (args, ctx) => {
      const command = {
        id: ctx.generateCommandId(),
        action: "screenshot",
        fullPage: args.fullPage,
      };
      const result = await executeCommand(ctx.sessionId, command);
      return handleScreenshotResult(ctx.sessionId, result);
    };
  }

  function recordingStartHandler(): CommandNode["handler"] {
    return async (args, ctx) => {
      const timeout = typeof args.timeout === "number" ? args.timeout : 60_000;
      const maxTimeout = 5 * 60 * 1000; // 5 minutes
      const clampedTimeout = Math.min(Math.max(timeout, 1000), maxTimeout);

      const recordingPath = `/tmp/recordings/${ctx.sessionId}/${Date.now()}.webm`;

      const command: BrowserCommand = {
        id: ctx.generateCommandId(),
        action: "recording_start",
        path: recordingPath,
        url: args.url,
        timeout: clampedTimeout,
      };
      const result = await executeCommand(ctx.sessionId, command);
      if (!result.success) {
        return errorResult(result.error || "Failed to start recording");
      }
      return {
        content: [
          {
            type: "text",
            text: `Recording started. Recording will automatically stop after ${clampedTimeout / 1000} seconds if not stopped manually.`,
          },
        ],
      };
    };
  }

  function recordingStopHandler(): CommandNode["handler"] {
    return async (...handlerArgs) => {
      const context = handlerArgs[1];
      const command: BrowserCommand = {
        id: context.generateCommandId(),
        action: "recording_stop",
      };
      const result = await executeCommand(context.sessionId, command);
      return handleRecordingStopResult(context.sessionId, result);
    };
  }

  function recordingRestartHandler(): CommandNode["handler"] {
    return async (args, ctx) => {
      const timeout = typeof args.timeout === "number" ? args.timeout : 60_000;
      const maxTimeout = 5 * 60 * 1000; // 5 minutes
      const clampedTimeout = Math.min(Math.max(timeout, 1000), maxTimeout);

      const recordingPath = `/tmp/recordings/${ctx.sessionId}/${Date.now()}.webm`;

      const command: BrowserCommand = {
        id: ctx.generateCommandId(),
        action: "recording_restart",
        path: recordingPath,
        url: args.url,
        timeout: clampedTimeout,
      };
      const result = await executeCommand(ctx.sessionId, command);
      if (!result.success) {
        return errorResult(result.error || "Failed to restart recording");
      }
      return {
        content: [
          {
            type: "text",
            text: `Recording restarted. Previous recording was saved. New recording will automatically stop after ${clampedTimeout / 1000} seconds if not stopped manually.`,
          },
        ],
      };
    };
  }

  const browserTree: Record<string, CommandNode> = {
    snapshot: {
      description:
        "Get the accessibility tree of the page. Use this to understand page structure and find elements before interacting.",
      handler: simpleHandler("snapshot"),
    },
    screenshot: {
      description:
        "Capture a screenshot. By default captures only the visible viewport. Set fullPage: true in subcommandArguments to capture the ENTIRE scrollable page in one image.",
      params: {
        fullPage: z
          .boolean()
          .optional()
          .describe(
            "Set to true to capture the full scrollable page in a single image instead of just the viewport"
          ),
      },
      handler: screenshotHandler(),
    },
    interact: {
      description: "Click, type, drag, and other interactions",
      children: {
        click: {
          description: "Click an element",
          params: {
            selector: z.string().describe("CSS selector of element to click"),
          },
          handler: simpleHandler("click", ["selector"]),
        },
        dblclick: {
          description: "Double-click an element",
          params: {
            selector: z
              .string()
              .describe("CSS selector of element to double-click"),
          },
          handler: simpleHandler("dblclick", ["selector"]),
        },
        type: {
          description: "Type text into element (appends to existing text)",
          params: {
            selector: z.string().describe("CSS selector of input element"),
            text: z.string().describe("Text to type"),
          },
          handler: simpleHandler("type", ["selector", "text"]),
        },
        fill: {
          description: "Clear input and fill with new value",
          params: {
            selector: z.string().describe("CSS selector of input element"),
            value: z.string().describe("Value to fill"),
          },
          handler: simpleHandler("fill", ["selector", "value"]),
        },
        press: {
          description:
            "Press a keyboard key or key combination (e.g., Enter, Tab, Control+a, Shift+ArrowDown)",
          params: {
            key: z.string().describe("Key or key combination to press"),
          },
          handler: async (args, ctx) => {
            if (!args.key) {
              return errorResult("'key' is required for press");
            }
            const command = {
              id: ctx.generateCommandId(),
              action: "keyboard",
              keys: args.key,
            };
            const result = await executeCommand(ctx.sessionId, command);
            return handleResult(result);
          },
        },
        hover: {
          description: "Hover over an element",
          params: {
            selector: z.string().describe("CSS selector of element to hover"),
          },
          handler: simpleHandler("hover", ["selector"]),
        },
        focus: {
          description: "Focus an element",
          params: {
            selector: z.string().describe("CSS selector of element to focus"),
          },
          handler: simpleHandler("focus", ["selector"]),
        },
        drag: {
          description: "Drag from one element to another",
          params: {
            source: z.string().describe("CSS selector of element to drag from"),
            target: z.string().describe("CSS selector of element to drag to"),
          },
          handler: simpleHandler("drag", ["source", "target"]),
        },
        check: {
          description: "Check a checkbox",
          params: {
            selector: z.string().describe("CSS selector of checkbox to check"),
          },
          handler: simpleHandler("check", ["selector"]),
        },
        uncheck: {
          description: "Uncheck a checkbox",
          params: {
            selector: z
              .string()
              .describe("CSS selector of checkbox to uncheck"),
          },
          handler: simpleHandler("uncheck", ["selector"]),
        },
        select: {
          description: "Select option(s) from a dropdown",
          params: {
            selector: z.string().describe("CSS selector of select element"),
            values: z.array(z.string()).describe("Option values to select"),
          },
          handler: simpleHandler("select", ["selector", "values"]),
        },
        upload: {
          description: "Upload files to a file input",
          params: {
            selector: z.string().describe("CSS selector of file input"),
            files: z.array(z.string()).describe("File paths to upload"),
          },
          handler: simpleHandler("upload", ["selector", "files"]),
        },
        download: {
          description: "Download a file by clicking an element",
          params: {
            selector: z
              .string()
              .describe("CSS selector of download link/button"),
            path: z.string().describe("Path to save the downloaded file"),
          },
          handler: simpleHandler("download", ["selector", "path"]),
        },
      },
    },
    nav: {
      description: "Page navigation and scrolling",
      children: {
        goto: {
          description: "Navigate to a URL",
          params: {
            url: z.string().describe("URL to navigate to"),
            waitUntil: z
              .enum(["load", "domcontentloaded", "networkidle"])
              .optional()
              .describe("When to consider navigation complete (default: load)"),
          },
          handler: async (args, ctx) => {
            if (!args.url) {
              return errorResult("'url' is required for goto");
            }
            const command = {
              id: ctx.generateCommandId(),
              action: "navigate",
              url: args.url,
              waitUntil: args.waitUntil,
            };
            const result = await executeCommand(ctx.sessionId, command);
            return handleResult(result);
          },
        },
        back: {
          description: "Go back in browser history",
          handler: simpleHandler("back"),
        },
        forward: {
          description: "Go forward in browser history",
          handler: simpleHandler("forward"),
        },
        reload: {
          description: "Reload the current page",
          handler: simpleHandler("reload"),
        },
        scroll: {
          description: "Scroll the page in a direction",
          params: {
            direction: z
              .enum(["up", "down", "left", "right"])
              .describe("Direction to scroll"),
            amount: z
              .number()
              .optional()
              .describe("Pixels to scroll (default: 300)"),
          },
          handler: async (args, ctx) => {
            const direction = args.direction as
              | "up"
              | "down"
              | "left"
              | "right"
              | undefined;
            if (!direction) {
              return errorResult(
                "'direction' is required for scroll (up, down, left, right)"
              );
            }
            const amount = typeof args.amount === "number" ? args.amount : 300;

            let deltaX = 0;
            let deltaY = 0;
            switch (direction) {
              case "up":
                deltaY = -amount;
                break;
              case "down":
                deltaY = amount;
                break;
              case "left":
                deltaX = -amount;
                break;
              case "right":
                deltaX = amount;
                break;
              default:
                break;
            }

            const command: BrowserCommand = {
              id: ctx.generateCommandId(),
              action: "scroll",
              x: deltaX,
              y: deltaY,
            };

            const result = await executeCommand(ctx.sessionId, command);
            return handleResult(result);
          },
        },
        scrollto: {
          description: "Scroll an element into view",
          params: {
            selector: z
              .string()
              .describe("CSS selector of element to scroll into view"),
          },
          handler: simpleHandler("scrollintoview", ["selector"]),
        },
        wait: {
          description: "Wait for an element to reach a certain state",
          params: {
            selector: z
              .string()
              .describe("CSS selector of element to wait for"),
            state: z
              .enum(["attached", "detached", "visible", "hidden"])
              .optional()
              .describe("State to wait for (default: visible)"),
            timeout: z
              .number()
              .optional()
              .describe("Max time to wait in milliseconds (default: 30000)"),
          },
          handler: simpleHandler("wait", ["selector"]),
        },
      },
    },

    element: {
      description: "Get element properties and state",
      children: {
        text: {
          description: "Get text content of an element",
          params: { selector: z.string().describe("CSS selector of element") },
          handler: simpleHandler("gettext", ["selector"]),
        },
        attr: {
          description: "Get an attribute value from an element",
          params: {
            selector: z.string().describe("CSS selector of element"),
            name: z.string().describe("Attribute name to get"),
          },
          handler: async (args, ctx) => {
            if (!args.selector) {
              return errorResult("'selector' is required");
            }
            if (!args.name) {
              return errorResult("'name' is required");
            }
            const command = {
              id: ctx.generateCommandId(),
              action: "getattribute",
              selector: args.selector,
              attribute: args.name,
            };
            const result = await executeCommand(ctx.sessionId, command);
            return handleResult(result);
          },
        },
        visible: {
          description: "Check if an element is visible",
          params: { selector: z.string().describe("CSS selector of element") },
          handler: simpleHandler("isvisible", ["selector"]),
        },
        enabled: {
          description: "Check if an element is enabled (not disabled)",
          params: { selector: z.string().describe("CSS selector of element") },
          handler: simpleHandler("isenabled", ["selector"]),
        },
        checked: {
          description: "Check if a checkbox or radio button is checked",
          params: {
            selector: z.string().describe("CSS selector of checkbox/radio"),
          },
          handler: simpleHandler("ischecked", ["selector"]),
        },
        count: {
          description: "Count how many elements match a selector",
          params: {
            selector: z.string().describe("CSS selector to count matches for"),
          },
          handler: simpleHandler("count", ["selector"]),
        },
        box: {
          description: "Get the bounding box (position and size) of an element",
          params: { selector: z.string().describe("CSS selector of element") },
          handler: simpleHandler("boundingbox", ["selector"]),
        },
        styles: {
          description: "Get computed CSS styles of an element",
          params: { selector: z.string().describe("CSS selector of element") },
          handler: simpleHandler("styles", ["selector"]),
        },
      },
    },

    page: {
      description:
        "Page content, PDF export, URL, title, JavaScript evaluation",
      children: {
        html: {
          description: "Get the HTML content of the page or a specific element",
          params: {
            selector: z
              .string()
              .optional()
              .describe("CSS selector to get HTML from (default: entire page)"),
          },
          handler: simpleHandler("content"),
        },
        pdf: {
          description: "Save the page as a PDF file",
          params: {
            path: z.string().describe("File path to save the PDF"),
            format: z
              .enum([
                "Letter",
                "Legal",
                "Tabloid",
                "Ledger",
                "A0",
                "A1",
                "A2",
                "A3",
                "A4",
                "A5",
                "A6",
              ])
              .optional()
              .describe("Paper format (default: Letter)"),
          },
          handler: simpleHandler("pdf", ["path"]),
        },
        url: {
          description: "Get the current page URL",
          handler: simpleHandler("url"),
        },
        title: {
          description: "Get the current page title",
          handler: simpleHandler("title"),
        },
        eval: {
          description: "Execute JavaScript code in the page context",
          params: { script: z.string().describe("JavaScript code to execute") },
          handler: simpleHandler("evaluate", ["script"]),
        },
        close: {
          description: "Close the browser session",
          handler: simpleHandler("close"),
        },
      },
    },

    debug: {
      description:
        "Debugging tools: console logs, errors, element highlighting",
      children: {
        console: {
          description: "Get browser console log messages",
          params: {
            clear: z
              .boolean()
              .optional()
              .describe("Clear logs after retrieving (default: false)"),
          },
          handler: simpleHandler("console"),
        },
        errors: {
          description: "Get JavaScript errors from the page",
          params: {
            clear: z
              .boolean()
              .optional()
              .describe("Clear errors after retrieving (default: false)"),
          },
          handler: simpleHandler("errors"),
        },
        highlight: {
          description:
            "Visually highlight an element on the page for debugging",
          params: {
            selector: z
              .string()
              .describe("CSS selector of element to highlight"),
          },
          handler: simpleHandler("highlight", ["selector"]),
        },
      },
    },

    state: {
      description: "Browser state: viewport, cookies, storage, tabs",
      children: {
        viewport: {
          description: "Set the browser viewport size",
          params: {
            width: z.number().describe("Viewport width in pixels"),
            height: z.number().describe("Viewport height in pixels"),
          },
          handler: simpleHandler("viewport", ["width", "height"]),
        },
        cookies: {
          description: "Cookie management",
          children: {
            get: {
              description: "Get cookies for the current page or specified URLs",
              params: {
                urls: z
                  .array(z.string())
                  .optional()
                  .describe("URLs to get cookies for (default: current page)"),
              },
              handler: simpleHandler("cookies_get"),
            },
            set: {
              description: "Set one or more cookies",
              params: {
                cookies: z
                  .array(
                    z.object({
                      name: z.string().describe("Cookie name"),
                      value: z.string().describe("Cookie value"),
                      url: z
                        .string()
                        .optional()
                        .describe("URL to set cookie for"),
                      domain: z.string().optional().describe("Cookie domain"),
                      path: z.string().optional().describe("Cookie path"),
                      expires: z
                        .number()
                        .optional()
                        .describe("Expiration timestamp"),
                      httpOnly: z
                        .boolean()
                        .optional()
                        .describe("HTTP only flag"),
                      secure: z.boolean().optional().describe("Secure flag"),
                      sameSite: z
                        .enum(["Strict", "Lax", "None"])
                        .optional()
                        .describe("SameSite policy"),
                    })
                  )
                  .describe("Array of cookies to set"),
              },
              handler: simpleHandler("cookies_set", ["cookies"]),
            },
            clear: {
              description: "Clear all cookies",
              handler: simpleHandler("cookies_clear"),
            },
          },
        },
        storage: {
          description: "Browser storage (localStorage/sessionStorage)",
          children: {
            get: {
              description: "Get a value from storage",
              params: {
                type: z
                  .enum(["local", "session"])
                  .describe("Storage type: local or session"),
                key: z
                  .string()
                  .optional()
                  .describe("Key to get (omit to get all keys)"),
              },
              handler: async (args, ctx) => {
                if (!args.type) {
                  return errorResult("'type' is required (local or session)");
                }
                const command = {
                  id: ctx.generateCommandId(),
                  action: "storage_get",
                  type: args.type,
                  key: args.key,
                };
                const result = await executeCommand(ctx.sessionId, command);
                return handleResult(result);
              },
            },
            set: {
              description: "Set a value in storage",
              params: {
                type: z
                  .enum(["local", "session"])
                  .describe("Storage type: local or session"),
                key: z.string().describe("Key to set"),
                value: z.string().describe("Value to store"),
              },
              handler: async (args, ctx) => {
                if (!args.type) {
                  return errorResult("'type' is required (local or session)");
                }
                if (!args.key) {
                  return errorResult("'key' is required");
                }
                if (args.value === undefined) {
                  return errorResult("'value' is required");
                }
                const command = {
                  id: ctx.generateCommandId(),
                  action: "storage_set",
                  type: args.type,
                  key: args.key,
                  value: args.value,
                };
                const result = await executeCommand(ctx.sessionId, command);
                return handleResult(result);
              },
            },
            clear: {
              description: "Clear all values from storage",
              params: {
                type: z
                  .enum(["local", "session"])
                  .describe("Storage type: local or session"),
              },
              handler: async (args, ctx) => {
                if (!args.type) {
                  return errorResult("'type' is required (local or session)");
                }
                const command = {
                  id: ctx.generateCommandId(),
                  action: "storage_clear",
                  type: args.type,
                };
                const result = await executeCommand(ctx.sessionId, command);
                return handleResult(result);
              },
            },
          },
        },
        tabs: {
          description: "Browser tab management",
          children: {
            list: {
              description: "List all open tabs with their URLs and titles",
              handler: simpleHandler("tab_list"),
            },
            new: {
              description: "Open a new tab",
              params: {
                url: z
                  .string()
                  .optional()
                  .describe("URL to open in new tab (default: blank page)"),
              },
              handler: simpleHandler("tab_new"),
            },
            switch: {
              description: "Switch to a tab by its index",
              params: { index: z.number().describe("Tab index (0-based)") },
              handler: simpleHandler("tab_switch", ["index"]),
            },
            close: {
              description: "Close a tab",
              params: {
                index: z
                  .number()
                  .optional()
                  .describe("Tab index to close (default: current tab)"),
              },
              handler: simpleHandler("tab_close"),
            },
          },
        },
      },
    },

    mouse: {
      description: "Low-level mouse control",
      children: {
        move: {
          description: "Move mouse cursor to specific coordinates",
          params: {
            x: z.number().describe("X coordinate in pixels"),
            y: z.number().describe("Y coordinate in pixels"),
          },
          handler: simpleHandler("mousemove", ["x", "y"]),
        },
        down: {
          description: "Press and hold a mouse button",
          params: {
            button: z
              .enum(["left", "right", "middle"])
              .optional()
              .describe("Mouse button (default: left)"),
          },
          handler: simpleHandler("mousedown"),
        },
        up: {
          description: "Release a mouse button",
          params: {
            button: z
              .enum(["left", "right", "middle"])
              .optional()
              .describe("Mouse button (default: left)"),
          },
          handler: simpleHandler("mouseup"),
        },
        wheel: {
          description:
            "Scroll using mouse wheel at current position. Move mouse first with mouse move.",
          params: {
            deltaY: z
              .number()
              .describe(
                "Vertical scroll amount (positive = down, negative = up)"
              ),
            deltaX: z
              .number()
              .optional()
              .describe("Horizontal scroll amount (default: 0)"),
          },
          handler: simpleHandler("wheel", ["deltaY"]),
        },
      },
    },

    record: {
      description:
        "Video recording controls for capturing browser sessions as WebM videos",
      children: {
        start: {
          description:
            "Start recording the browser session. Creates a WebM video. Note: Recording requires a fresh browser context which may clear cookies/storage state. Default timeout is 60 seconds (max 5 minutes).",
          params: {
            url: z
              .string()
              .optional()
              .describe("Optional URL to navigate to before recording starts"),
            timeout: z
              .number()
              .optional()
              .describe(
                "Recording timeout in milliseconds. Default: 60000 (60s). Max: 300000 (5 min). Increase for longer recordings, decrease for quick captures."
              ),
          },
          handler: recordingStartHandler(),
        },
        stop: {
          description:
            "Stop the current recording and upload the video to storage",
          handler: recordingStopHandler(),
        },
        restart: {
          description:
            "Stop the current recording (saving it) and immediately start a new one. Useful for segmenting long sessions. Default timeout is 60 seconds (max 5 minutes).",
          params: {
            url: z
              .string()
              .optional()
              .describe("Optional URL to navigate to for the new recording"),
            timeout: z
              .number()
              .optional()
              .describe(
                "Recording timeout in milliseconds. Default: 60000 (60s). Max: 300000 (5 min). Increase for longer recordings, decrease for quick captures."
              ),
          },
          handler: recordingRestartHandler(),
        },
      },
    },
  };

  createHierarchicalTool(server, {
    name: "browser",
    description: "Browser automation - run with no command to see categories",
    sessionParam: "sessionId",
    tree: browserTree,
    resolveSessionId: (args, extra) =>
      resolveBoundLabSessionId(
        extra,
        typeof args.sessionId === "string" ? args.sessionId : undefined
      ),
    contextFactory: (sessionId) => ({
      sessionId,
      generateCommandId: () =>
        `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }),
  });
}
