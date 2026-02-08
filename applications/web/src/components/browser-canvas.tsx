"use client";

import {
  useEffect,
  useState,
  useRef,
  useCallback,
  createContext,
  use,
  type ReactNode,
} from "react";
import { useMultiplayer } from "@/lib/multiplayer";
import { useMultiplayerEnabled } from "@/app/providers";
import { cn } from "@/lib/cn";

type BrowserCurrentState = "pending" | "stopped" | "starting" | "running" | "stopping" | "error";

interface BrowserStreamState {
  currentState: BrowserCurrentState;
  errorMessage?: string;
  subscribe: () => () => void;
  subscribeToFrames: (callback: (bitmap: ImageBitmap) => void) => () => void;
  getBitmap: () => ImageBitmap | null;
}

const BrowserStreamContext = createContext<BrowserStreamState | null>(null);

function useBrowserStream() {
  const context = use(BrowserStreamContext);
  if (!context) {
    throw new Error("useBrowserStream must be used within BrowserCanvas.Root");
  }
  return context;
}

interface RootProps {
  sessionId: string;
  children: ReactNode;
}

function BrowserCanvasRoot({ sessionId, children }: RootProps) {
  const isEnabled = useMultiplayerEnabled();
  const [subscriberCount, setSubscriberCount] = useState(0);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const frameListenersRef = useRef(new Set<(bitmap: ImageBitmap) => void>());
  const { useChannel, useChannelEvent } = useMultiplayer();

  const isActive = subscriberCount > 0;

  const browserState = useChannel(
    "sessionBrowserState",
    { uuid: sessionId },
    { enabled: isActive },
  );
  const frameSnapshot = useChannel(
    "sessionBrowserFrames",
    { uuid: sessionId },
    { enabled: isActive },
  );

  useEffect(() => {
    bitmapRef.current?.close();
    bitmapRef.current = null;
  }, [sessionId]);

  const processFrame = async (base64: string) => {
    try {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "image/jpeg" });
      const newBitmap = await createImageBitmap(blob);

      bitmapRef.current?.close();
      bitmapRef.current = newBitmap;

      // Notify listeners imperatively - no React state update
      for (const listener of frameListenersRef.current) {
        listener(newBitmap);
      }
    } catch (error) {
      console.warn(error);
    }
  };

  useEffect(() => {
    if (isEnabled && isActive && frameSnapshot.lastFrame && !bitmapRef.current) {
      processFrame(frameSnapshot.lastFrame);
    }
  }, [isEnabled, isActive, frameSnapshot.lastFrame]);

  const handleFrameEvent = (event: { type: "frame"; data: string; timestamp: number }) => {
    processFrame(event.data);
  };

  useChannelEvent(
    "sessionBrowserFrames",
    handleFrameEvent,
    { uuid: sessionId },
    { enabled: isActive },
  );

  useEffect(() => {
    return () => {
      bitmapRef.current?.close();
    };
  }, []);

  const subscribe = useCallback(() => {
    setSubscriberCount((count) => count + 1);
    return () => setSubscriberCount((count) => count - 1);
  }, []);

  const subscribeToFrames = useCallback((callback: (bitmap: ImageBitmap) => void) => {
    frameListenersRef.current.add(callback);
    // Send current frame immediately if available
    if (bitmapRef.current) {
      callback(bitmapRef.current);
    }
    return () => {
      frameListenersRef.current.delete(callback);
    };
  }, []);

  const getBitmap = useCallback(() => bitmapRef.current, []);

  return (
    <BrowserStreamContext
      value={{
        currentState: browserState.currentState,
        errorMessage: browserState.errorMessage ?? undefined,
        subscribe,
        subscribeToFrames,
        getBitmap,
      }}
    >
      {children}
    </BrowserStreamContext>
  );
}

function BrowserCanvasPlaceholder({ children }: { children?: ReactNode }) {
  const { getBitmap, subscribeToFrames, subscribe } = useBrowserStream();
  const initialHasFrame = getBitmap() !== null;
  const [hasFrame, setHasFrame] = useState(initialHasFrame);
  const hasFrameRef = useRef(initialHasFrame);

  useEffect(() => {
    const unsubscribe = subscribe();
    return unsubscribe;
  }, [subscribe]);

  useEffect(() => {
    if (hasFrameRef.current) return;

    const onFrame = () => {
      if (!hasFrameRef.current) {
        hasFrameRef.current = true;
        setHasFrame(true);
      }
    };

    const unsubscribe = subscribeToFrames(onFrame);
    return unsubscribe;
  }, [subscribeToFrames]);

  if (hasFrame) return null;

  if (children) return children;

  return (
    <div
      className="aspect-video flex items-center justify-center"
      style={{
        background:
          "repeating-linear-gradient(-45deg, var(--color-bg-muted), var(--color-bg-muted) 4px, var(--color-bg) 4px, var(--color-bg) 8px)",
      }}
    >
      <div className="size-4 border-2 border-text-muted border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function BrowserCanvasView({ className }: { className?: string }) {
  const { subscribe, subscribeToFrames } = useBrowserStream();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasFrame, setHasFrame] = useState(false);
  const hasFrameRef = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribe();
    return unsubscribe;
  }, [subscribe]);

  useEffect(() => {
    const drawFrame = (bitmap: ImageBitmap) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const context = canvas.getContext("2d");
      if (!context) return;

      if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
      }

      context.drawImage(bitmap, 0, 0);

      if (!hasFrameRef.current) {
        hasFrameRef.current = true;
        setHasFrame(true);
      }
    };

    const unsubscribe = subscribeToFrames(drawFrame);
    return unsubscribe;
  }, [subscribeToFrames]);

  return (
    <div
      className={cn("relative overflow-hidden", className ?? "aspect-video bg-black")}
      style={{ display: hasFrame ? undefined : "none" }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-contain" />
    </div>
  );
}

export const BrowserCanvas = {
  Root: BrowserCanvasRoot,
  Placeholder: BrowserCanvasPlaceholder,
  View: BrowserCanvasView,
};
