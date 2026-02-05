import type { Context, FieldValue } from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const setNested = (target: Record<string, unknown>, key: string, value: unknown) => {
  if (!key.includes(".")) {
    target[key] = value;
    return;
  }

  const parts = key.split(".");
  const lastPart = parts.pop();
  if (lastPart === undefined) return;

  let current = target;

  for (const part of parts) {
    const existing = current[part];
    if (Object.hasOwn(current, part) && isRecord(existing)) {
      current = existing;
    } else {
      const next: Record<string, unknown> = Object.create(null);
      current[part] = next;
      current = next;
    }
  }

  current[lastPart] = value;
};

export const flush = (context: Context | undefined): Record<string, unknown> => {
  if (!context) return {};

  const event: Record<string, unknown> = Object.create(null);
  const counters: Record<string, number> = Object.create(null);
  const arrays: Record<string, FieldValue[]> = Object.create(null);
  const maxValues: Record<string, number> = Object.create(null);
  const minValues: Record<string, number> = Object.create(null);
  const timers: Record<string, { start: number; accumulated: number }> = Object.create(null);

  for (const entry of context.operations) {
    switch (entry.operation) {
      case "set":
        setNested(event, entry.key, entry.value);
        break;
      case "count":
        counters[entry.key] = (counters[entry.key] ?? 0) + entry.amount;
        break;
      case "append":
        (arrays[entry.key] ??= []).push(entry.value);
        break;
      case "max": {
        const current = maxValues[entry.key];
        if (current === undefined || entry.value > current) {
          maxValues[entry.key] = entry.value;
        }
        break;
      }
      case "min": {
        const current = minValues[entry.key];
        if (current === undefined || entry.value < current) {
          minValues[entry.key] = entry.value;
        }
        break;
      }
      case "time.start": {
        const timer = (timers[entry.key] ??= { start: 0, accumulated: 0 });
        timer.start = entry.time;
        break;
      }
      case "time.stop": {
        const timer = timers[entry.key];
        if (timer && timer.start > 0) {
          timer.accumulated += entry.time - timer.start;
          timer.start = 0;
        }
        break;
      }
    }
  }

  for (const key in counters) setNested(event, key, counters[key]);
  for (const key in arrays) setNested(event, key, arrays[key]);
  for (const key in maxValues) setNested(event, key, maxValues[key]);
  for (const key in minValues) setNested(event, key, minValues[key]);
  for (const key in timers) {
    const timer = timers[key];
    if (timer) setNested(event, key, Math.round(timer.accumulated * 100) / 100);
  }

  context.operations.length = 0;
  return event;
};
