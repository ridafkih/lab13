import { schema } from "@lab/multiplayer-sdk";
import { server } from "./server";
import { createPublisher } from "@lab/multiplayer-server";

export const publisher = createPublisher(schema, () => server);
