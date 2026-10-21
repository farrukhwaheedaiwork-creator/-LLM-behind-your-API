import express from "express";
import triageRoute from "./routes/triage.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use(triageRoute); // in your real API: app.use(triageRoute) next to your other routers

  // Malformed JSON / oversized body -> clean JSON, never a stack trace.
  app.use((err, _req, res, _next) => {
    const status = err.status && err.status < 500 ? err.status : 500;
    res.status(status).json({
      error: status === 400 ? "invalid_json" : "request_error",
      message: status === 400 ? "Request body is not valid JSON." : "Request could not be processed.",
    });
  });
  return app;
}
