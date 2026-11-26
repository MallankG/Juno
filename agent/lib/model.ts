import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * The model, served by Groq (OpenAI-compatible API, free tier).
 *
 * Set GROQ_API_KEY. GROQ_MODEL picks the model; the default is OpenAI's open
 * gpt-oss-20b, which runs on Groq and supports tool calling.
 *
 * Free-tier limits are tight (tokens per minute and per day). Keep prompts
 * short and rely on the rate limits in agent/lib/rate-limit.ts.
 */
const groq = createOpenAICompatible({
  name: "groq",
  baseURL: "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY,
  includeUsage: true,
});

export const MODEL_ID = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
export const model = groq(MODEL_ID);
