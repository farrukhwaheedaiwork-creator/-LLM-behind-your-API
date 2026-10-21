import { Router } from "express";
import { TriageInput, STUB_RESULT, FALLBACK_RESULT } from "../llm/schema.js";
import { triage, ModelOutputError } from "../llm/triage.js";
import { isTimeout } from "../llm/retry.js";
import { promptVersion } from "../llm/prompt.js";
import { log } from "../llm/log.js";

const router = Router();

router.post("/triage", async (req, res) => {
  // 1. Validate input BEFORE any model call.
  const parsed = TriageInput.safeParse(req.body ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res.status(400).json({
      error: "invalid_input",
      field: issue.path.length ? issue.path.join(".") : "body",
      message: issue.message,
    });
  }
  const { text } = parsed.data;

  // 2. Kill switch (wins over everything): no model call, deterministic fallback.
  if (process.env.LLM_ENABLED === "false") {
    log({ event: "llm_disabled", note: "kill switch on, model not called" });
    res.set("X-LLM-Mode", "disabled");
    return res.json(FALLBACK_RESULT);
  }

  // 3. Stub mode: schema-valid fake answer, zero model calls.
  if (process.env.LLM_STUB === "1") {
    res.set("X-LLM-Mode", "stub");
    return res.json(STUB_RESULT);
  }

  // 4. Real call.
  try {
    const result = await triage(text);
    res.set("X-LLM-Mode", "live");
    res.set("X-Prompt-Version", promptVersion());
    return res.json(result); // always schema-validated, never raw model text
  } catch (err) {
    if (err instanceof ModelOutputError) {
      return res.status(422).json({
        error: "model_output_invalid",
        message: "The model did not return a valid result after one repair attempt. The attempt was quarantined.",
      });
    }
    if (err?.code === "LLM_CONFIG") {
      return res.status(503).json({ error: "llm_not_configured", message: err.message });
    }
    if (isTimeout(err)) {
      return res.status(504).json({ error: "llm_timeout", message: "The model did not answer in time. Try again shortly." });
    }
    if (err?.status === 401 || err?.status === 403) {
      return res.status(502).json({ error: "llm_auth_failed", message: "The LLM provider rejected our credentials. Check LLM_API_KEY." });
    }
    if (err?.status === 429) {
      return res.status(503).json({ error: "llm_rate_limited", message: "The LLM provider is rate limiting us. Try again later." });
    }
    log({ event: "unhandled_llm_error", status: err?.status, message: err?.message });
    return res.status(502).json({ error: "llm_upstream_error", message: "The LLM provider failed to answer." });
  }
});

export default router;
