import { AsyncLocalStorage } from "node:async_hooks";
import { flush as flushContext } from "./flush";
import type { MaybePromise } from "bun";
import type { Context, DottedKey, FieldValue } from "./types";

export type Transport = (event: Record<string, unknown>) => void;

export interface WideloggerOptions {
  transport: Transport;
}

export interface ErrorFieldsOptions {
  prefix?: string;
  includeStack?: boolean;
}

interface ParsedErrorFields {
  error_name: string;
  error_message: string;
  error_stack?: string;
}

function getErrorFields(error: unknown, includeStack = true): ParsedErrorFields {
  if (error instanceof Error) {
    return {
      error_name: error.name,
      error_message: error.message,
      error_stack: includeStack ? error.stack : undefined,
    };
  }

  if (typeof error === "string") {
    return {
      error_name: "Error",
      error_message: error,
    };
  }

  return {
    error_name: "UnknownError",
    error_message: "Unknown error",
  };
}

export const widelogger = (options: WideloggerOptions) => {
  const storage = new AsyncLocalStorage<Context>();
  const { transport } = options;

  const getContext = (): Context | undefined => storage.getStore();

  const widelog = {
    set: <K extends string>(key: DottedKey<K>, value: FieldValue) => {
      getContext()?.operations.push({ operation: "set", key, value });
    },
    count: <K extends string>(key: DottedKey<K>, amount = 1) => {
      getContext()?.operations.push({ operation: "count", key, amount });
    },
    append: <K extends string>(key: DottedKey<K>, value: FieldValue) => {
      getContext()?.operations.push({ operation: "append", key, value });
    },
    max: <K extends string>(key: DottedKey<K>, value: number) => {
      getContext()?.operations.push({ operation: "max", key, value });
    },
    min: <K extends string>(key: DottedKey<K>, value: number) => {
      getContext()?.operations.push({ operation: "min", key, value });
    },
    time: {
      start: <K extends string>(key: DottedKey<K>) => {
        getContext()?.operations.push({ operation: "time.start", key, time: performance.now() });
      },
      stop: <K extends string>(key: DottedKey<K>) => {
        getContext()?.operations.push({ operation: "time.stop", key, time: performance.now() });
      },
    },
    errorFields: (error: unknown, options: ErrorFieldsOptions = {}) => {
      const context = getContext();
      if (!context) return;

      const prefix = options.prefix ?? "error";
      const fields = getErrorFields(error, options.includeStack ?? true);

      for (const [field, value] of Object.entries(fields)) {
        if (typeof value === "undefined") continue;
        context.operations.push({
          operation: "set",
          key: `${prefix}.${field}`,
          value,
        });
      }
    },
    flush: () => {
      const event = flushContext(getContext());
      transport(event);
    },
    context: <T>(callback: () => MaybePromise<T>): MaybePromise<T> => {
      return storage.run({ operations: [] }, callback);
    },
  };

  return { widelog };
};
