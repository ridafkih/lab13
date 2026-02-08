"use client";

import { createMultiplayerProvider } from "@lab/multiplayer-client";
import { schema } from "@lab/multiplayer-sdk";

export const { MultiplayerProvider, useMultiplayer } = createMultiplayerProvider(schema);
