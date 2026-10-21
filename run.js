// Usage: start the server with a REAL model (LLM_STUB=0), then: npm run eval
import { readFile, writeFile } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
const DELAY_MS = Number(process.env.EVAL_DELAY_MS ?? 3500); // stay under 20 requests/minute
const cases = JSON.parse(await readFile(new URL("./cases.json", import.meta.url), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
let promptVersion = "unknown";
let mode = "unknown";
const failures = [];

for (const c of cases) {
  const res = await fetch(`${BASE}/triage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: c.text }),
  });
  promptVersion = res.headers.get("x-prompt-version") ?? promptVersion;
  mode = res.headers.get("x-llm-mode") ?? mode;
  const body = await res.json().catch(() => ({}));

  const accepted = [c.expectCategory, ...(c.alsoAccept ?? [])];
  const okCategory = res.status === 200 && accepted.includes(body.category);
  const okConfidence = c.maxConfidence === undefined || (typeof body.confidence === "number" && body.confidence <= c.maxConfidence);
  const ok = okCategory && okConfidence;

  if (ok) passed++;
  else failures.push({ id: c.id, kind: c.kind, expected: accepted, got: res.status === 200 ? body : { status: res.status, ...body } });
  console.log(`${ok ? "PASS" : "FAIL"}  #${c.id} (${c.kind})  ->  ${res.status === 200 ? `${body.category} / ${body.confidence}` : res.status}`);
  await sleep(DELAY_MS);
}

const percent = Math.round((passed / cases.length) * 100);
console.log(`\nScore: ${passed}/${cases.length} (${percent}%) on category`);
if (failures.length) console.log("Failed:", JSON.stringify(failures, null, 2));

if (mode !== "live") {
  console.log(`\nNot saving a result: server mode was "${mode}", not "live". Unset LLM_STUB / set LLM_ENABLED=true and rerun.`);
} else {
  const result = { date: new Date().toISOString().slice(0, 10), promptVersion, model: process.env.LLM_MODEL ?? "(server's LLM_MODEL)", passed, total: cases.length, percent, failures };
  await writeFile(new URL("./last-result.json", import.meta.url), JSON.stringify(result, null, 2));
  console.log("Saved evals/last-result.json - copy the numbers into the README.");
}
