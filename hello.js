// Stage 0 throwaway: proves the provider works from this machine.
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: process.env.LLM_BASE_URL, // OpenRouter: https://openrouter.ai/api/v1 | Ollama: http://localhost:11434/v1/
  apiKey: process.env.LLM_API_KEY,
});

const res = await client.chat.completions.create({
  model: process.env.LLM_MODEL, // "openrouter/free" or "gemma3:1b"
  messages: [{ role: "user", content: "Reply with exactly the word: ready" }],
});
console.log(res.choices[0].message.content);
