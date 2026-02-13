import { widelog } from "../logging";
import type { Handler, InfraContext } from "../types/route";

interface ConfigOption {
  category: string;
  options?: Array<{ name: string; value: string }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseConfigOptions(
  agentInfo: Record<string, unknown>
): ConfigOption[] {
  const rawConfigOptions = agentInfo.configOptions;
  if (!Array.isArray(rawConfigOptions)) {
    return [];
  }

  return rawConfigOptions.flatMap((option) => {
    if (!isRecord(option) || typeof option.category !== "string") {
      return [];
    }

    const parsedOptionValues = Array.isArray(option.options)
      ? option.options.flatMap((optionValue) => {
          if (
            !isRecord(optionValue) ||
            typeof optionValue.name !== "string" ||
            typeof optionValue.value !== "string"
          ) {
            return [];
          }
          return [{ name: optionValue.name, value: optionValue.value }];
        })
      : undefined;

    return [{ category: option.category, options: parsedOptionValues }];
  });
}

const GET: Handler<InfraContext> = async ({ context }) => {
  const agentInfo = await context.acp.getAgent("claude", {
    config: true,
  });
  const configOptions = parseConfigOptions(agentInfo);

  const modelConfig = configOptions?.find((opt) => opt.category === "model");
  const models = (modelConfig?.options ?? []).map((opt) => ({
    modelId: opt.value,
    name: opt.name,
  }));

  widelog.set("model.count", models.length);
  return Response.json({
    models: models.sort((left, right) => left.name.localeCompare(right.name)),
  });
};

export { GET };
