import { schema, type AppSchema } from "@lab/multiplayer-sdk";
import type { BrowserService } from "../browser/browser-service";
import { createSnapshotLoaders } from "../snapshots/snapshot-loaders";

type ChannelName = keyof AppSchema["channels"];

function isChannelName(name: string): name is ChannelName {
  return name in schema.channels;
}

export function createChannelRestHandler(browserService: BrowserService) {
  const loaders = createSnapshotLoaders(browserService);

  return async (channelName: string, searchParams: URLSearchParams): Promise<Response> => {
    if (!isChannelName(channelName)) {
      return Response.json({ error: "Unknown channel" }, { status: 404 });
    }

    const session = searchParams.get("session");
    const data = await loaders[channelName](session);

    if (data === null) {
      return Response.json({ error: "Missing session parameter" }, { status: 400 });
    }

    return Response.json({
      channel: channelName,
      data,
      timestamp: Date.now(),
    });
  };
}
