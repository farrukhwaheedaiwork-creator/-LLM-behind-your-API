import { z } from "zod";

export const CATEGORIES = ["billing", "bug", "feature", "other"];
export const URGENCIES = ["low", "normal", "high"];

export const TriageInput = z.object({
  text: z
    .string({ required_error: "text is required", invalid_type_error: "text must be a string" })
    .trim()
    .min(1, "text must not be empty")
    .max(2000, "text must be at most 2000 characters"),
});

// strict() => the model may not add fields.
export const TriageOutput = z
  .object({
    category: z.enum(CATEGORIES),
    urgency: z.enum(URGENCIES),
    confidence: z.number().min(0).max(1),
    reason: z.string().min(1).max(300),
  })
  .strict();

export const STUB_RESULT = {
  category: "other",
  urgency: "low",
  confidence: 0.1,
  reason: "Stub mode: no model was called.",
};

export const FALLBACK_RESULT = {
  category: "other",
  urgency: "normal",
  confidence: 0,
  reason: "AI triage is switched off; routed to the default queue.",
};

export function formatIssues(error) {
  return error.issues
    .map((i) => `${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`)
    .join("; ");
}
