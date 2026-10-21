import OpenAI from "openai";

let client;

export function getTimeoutMs() {
  const n = Number(process.env.LLM_TIMEOUT_MS ?? 30000);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 60000) : 30000; // never above 60 s
}

export function getClient() {
  if (client) return client;
  const { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL } = process.env;
  if (!LLM_BASE_URL || !LLM_API_KEY || !LLM_MODEL) {
    const e = new Error("LLM is not configured: set LLM_BASE_URL, LLM_API_KEY and LLM_MODEL");
    e.code = "LLM_CONFIG";
    throw e;
  }
  client = new OpenAI({
    baseURL: LLM_BASE_URL,
    apiKey: LLM_API_KEY,
    timeout: getTimeoutMs(), // explicit: the SDK default is 10 minutes
    maxRetries: 0, // explicit: I do my own retries in retry.js
  });
  return client;
}
