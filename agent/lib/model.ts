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
/**
 * The AI SDK sends the model's earlier reasoning back as `reasoning_content`
 * on assistant messages (for example after a tool call). Groq rejects that
 * field with a 400 error, so it is removed before each request.
 */
export function stripReasoning(body: string): string {
  try {
    const json = JSON.parse(body) as { messages?: Array<Record<string, unknown>> };
    if (!Array.isArray(json.messages)) return body;
    let changed = false;
    for (const message of json.messages) {
      for (const key of ["reasoning_content", "reasoning"]) {
        if (key in message) {
          delete message[key];
          changed = true;
        }
      }
    }
    return changed ? JSON.stringify(json) : body;
  } catch {
    return body;
  }
}

const groqFetch: typeof fetch = (input, init) =>
  fetch(input, init && typeof init.body === "string" ? { ...init, body: stripReasoning(init.body) } : init);

const groq = createOpenAICompatible({
  name: "groq",
  baseURL: "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY,
  includeUsage: true,
  fetch: groqFetch,
});

export const MODEL_ID = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
export const model = groq(MODEL_ID);
