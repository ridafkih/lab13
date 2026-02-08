import { useMultiplayer } from "./multiplayer";

/**
 * Returns the streaming session title from the multiplayer channel.
 * Falls back to the provided session title if the channel hasn't received data yet.
 *
 * This hook consolidates the streaming title logic so that changes only need
 * to be made in one place.
 */
export function useSessionTitle(sessionId: string, fallbackTitle?: string | null): string | null {
  const { useChannel } = useMultiplayer();
  const metadata = useChannel("sessionMetadata", { uuid: sessionId });

  return metadata.title ?? fallbackTitle ?? null;
}
