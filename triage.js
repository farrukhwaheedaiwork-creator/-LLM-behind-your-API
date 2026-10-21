import { appendFile, mkdir } from "node:fs/promises";
import { getClient } from "./client.js";
import { withRetry } from "./retry.js";
import { loadPrompt } from "./prompt.js";
import { TriageOutput, formatIssues } from "./schema.js";
import { log } from "./log.js";

export class ModelOutputError extends Error {
  constructor(message) {
    super(message);
    this.name = "ModelOutputError";
  }
}

// Models wrap JSON in fences or add "Sure! Here's the JSON:". Strip, find the object, parse.
export function parseModelText(raw) {
  try {
    let t = String(raw ?? "").trim();
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start === -1 || end <= start) return { ok: false, error: "No JSON object found in the answer." };
    return { ok: true, value: JSON.parse(t.slice(start, end + 1)) };
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${e.message}` };
  }
}

export function parseAndValidate(raw) {
  const parsed = parseModelText(raw);
  if (!parsed.ok) return parsed;
  const result = TriageOutput.safeParse(parsed.value);
  return result.success ? { ok: true, value: result.data } : { ok: false, error: formatIssues(result.error) };
}

async function callModel(messages, repairAttempt, promptName) {
  const client = getClient();
  const model = process.env.LLM_MODEL;
  const maxRetries = Number(process.env.LLM_MAX_RETRIES ?? 3);
  const maxTokens = Number(process.env.LLM_MAX_TOKENS ?? 400);

  try {
    const { value, attempts } = await withRetry(
      async () => {
        const t0 = Date.now();
        const res = await client.chat.completions.create({
          model,
          messages,
          temperature: 0,
          max_tokens: maxTokens,
        });
        return { res, durationMs: Date.now() - t0 };
      },
      {
        maxRetries,
        onRetry: (err, attempt, delay) =>
          log({ event: "llm_retry", promptVersion: promptName, status: err?.status ?? err?.name, attempt, delayMs: Math.round(delay) }),
      }
    );
    const { res, durationMs } = value;
    const msg = res.choices?.[0]?.message ?? {};
    // A refusal is a normal response, not an exception: treat it as text that fails validation.
    const content = msg.content ?? msg.refusal ?? "";
    log({
      event: "llm_call",
      promptVersion: promptName,
      model: res.model ?? model,
      inputTokens: res.usage?.prompt_tokens ?? null,
      outputTokens: res.usage?.completion_tokens ?? null,
      durationMs,
      repairCount: repairAttempt, // 0 = first call, 1 = this was the repair call
      networkAttempts: attempts,
    });
    return content;
  } catch (err) {
    log({ event: "llm_error", promptVersion: promptName, model, status: err?.status ?? err?.name ?? "unknown", repairCount: repairAttempt });
    throw err;
  }
}

async function quarantine(entry) {
  try {
    await mkdir(new URL("../../logs/", import.meta.url), { recursive: true });
    await appendFile(new URL("../../logs/quarantine.jsonl", import.meta.url), JSON.stringify(entry) + "\n");
  } catch (e) {
    log({ event: "quarantine_write_failed", message: e.message });
  }
}

export async function triage(text) {
  const prompt = loadPrompt();
  const messages = [
    { role: "system", content: prompt.text },
    // User data is a separate message and JSON-encoded so it cannot break out of its quotes.
    { role: "user", content: JSON.stringify({ text }) },
  ];

  const first = await callModel(messages, 0, prompt.name);
  const v1 = parseAndValidate(first);
  if (v1.ok) return v1.value;

  // Exactly one repair retry: original prompt + broken answer + exact error.
  const repairMessages = [
    ...messages,
    { role: "assistant", content: first || "(empty answer)" },
    {
      role: "user",
      content: `Your previous answer was rejected for this reason: ${v1.error}\nReturn only corrected JSON matching the schema.`,
    },
  ];
  const second = await callModel(repairMessages, 1, prompt.name);
  const v2 = parseAndValidate(second);
  if (v2.ok) return v2.value;

  await quarantine({
    ts: new Date().toISOString(),
    promptVersion: prompt.name,
    input: text,
    rawOutputs: [first, second],
    errors: [v1.error, v2.error],
  });
  throw new ModelOutputError(v2.error);
}
