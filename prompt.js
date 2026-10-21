import { readFileSync } from "node:fs";

const cache = new Map();

export function promptVersion() {
  return process.env.PROMPT_VERSION || "v1";
}

export function loadPrompt() {
  const name = `triage-${promptVersion()}`;
  if (!cache.has(name)) {
    const url = new URL(`../../prompts/${name}.md`, import.meta.url);
    cache.set(name, readFileSync(url, "utf8"));
  }
  return { name, text: cache.get(name) };
}
