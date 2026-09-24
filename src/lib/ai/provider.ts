import { GeminiLLMProvider } from "./gemini-provider";
import { MockLLMProvider, LLMProvider } from "./mock-provider";

let defaultProvider: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (!defaultProvider) {
    if (process.env.GEMINI_API_KEY) {
      defaultProvider = new GeminiLLMProvider(process.env.GEMINI_API_KEY);
    } else {
      defaultProvider = new MockLLMProvider();
    }
  }
  return defaultProvider;
}

export type { LLMProvider };
