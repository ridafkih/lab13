import type { LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { ConfigurationError } from "./errors";

interface LlmModelConfig {
  provider: string;
  model: string;
  apiKey: string;
}

const MODEL_ENV_VARS = {
  orchestrator: {
    provider: "ORCHESTRATOR_MODEL_PROVIDER",
    name: "ORCHESTRATOR_MODEL_NAME",
    apiKey: "ORCHESTRATOR_MODEL_API_KEY",
  },
  chatOrchestrator: {
    provider: "CHAT_ORCHESTRATOR_MODEL_PROVIDER",
    name: "CHAT_ORCHESTRATOR_MODEL_NAME",
    apiKey: "CHAT_ORCHESTRATOR_MODEL_API_KEY",
  },
} as const;

export type ModelName = keyof typeof MODEL_ENV_VARS;

export function readModelConfig(name: ModelName): LlmModelConfig {
  const envVars = MODEL_ENV_VARS[name];
  const provider = process.env[envVars.provider];
  const model = process.env[envVars.name];
  const apiKey = process.env[envVars.apiKey];

  if (!provider || !model || !apiKey) {
    throw new ConfigurationError(
      `Missing model config. Set ${envVars.provider}, ${envVars.name}, and ${envVars.apiKey}`,
    );
  }

  return { provider, model, apiKey };
}

export function createLanguageModel(config: LlmModelConfig): LanguageModel {
  switch (config.provider) {
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey: config.apiKey });
      return anthropic(config.model);
    }
    case "openai": {
      const openai = createOpenAI({ apiKey: config.apiKey });
      return openai(config.model);
    }
    default:
      throw new ConfigurationError(`Unsupported LLM provider: ${config.provider}`);
  }
}
