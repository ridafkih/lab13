import { generateText } from "ai";
import { readModelConfig, createLanguageModel } from "../shared/llm-factory";

export async function complete(prompt: string): Promise<string> {
  const config = readModelConfig("orchestrator");
  const model = createLanguageModel(config);

  const { text } = await generateText({ model, prompt });
  return text;
}
