import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;
const model = "openai/gpt-oss-20b";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabasePublishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const authEnabled = Boolean(supabaseUrl && supabasePublishableKey);

if (!process.env.GROQ_API_KEY) console.warn("GROQ_API_KEY is not set.");
if (!authEnabled) console.warn("Supabase auth is disabled.");

const client = new OpenAI({
  baseURL: "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY
});

const supabase = authEnabled
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

app.disable("x-powered-by");

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=());
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  next();
});

app.use(express.json({ limit: "3mb" }));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

app.get("/api/config", (_req, res) =>
  res.json({
    authEnabled,
    supabaseUrl: authEnabled ? supabaseUrl : null,
    supabasePublishableKey: authEnabled ? supabasePublishableKey : null,
    models: [{ id: model, name: "GPT-OSS 20B", free: true }]
  })
);

app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    model,
    configured: Boolean(process.env.GROQ_API_KEY),
    authEnabled
  })
);

async function authenticate(req, res) {
  if (!authEnabled) return { id: "guest", email: null };

  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    res.status(401).json({ error: "Please sign in to use ProjectSyntra." });
    return null;
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({
      error: "Your session is invalid or expired. Please sign in again."
    });
    return null;
  }

  return data.user;
}

app.post("/api/chat", async (req, res) => {
  const user = await authenticate(req, res);
  if (!user) return;

  try {
    const { messages, model: requestedModel } = req.body;

    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: "messages must be a non-empty array." });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({ error: "The server API key has not been configured yet." });
    }

    if (requestedModel && requestedModel !== model) {
      return res.status(400).json({ error: "That model is not available on the current configuration." });
    }

    const safeMessages = messages
      .filter(m => m && ["system", "user", "assistant"].includes(m.role))
      .map(m => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content.slice(0, 100000) : ""
      }))
      .filter(m => m.content);

    if (!safeMessages.length) {
      return res.status(400).json({ error: "No valid messages were provided." });
    }

    const completion = await client.chat.completions.create({
      model,
      messages: safeMessages,
      max_completion_tokens: 4096,
      temperature: 0.7,
      stream: true
    });

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    for await (const chunk of completion) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        res.write("data: " + JSON.stringify({ type: "delta", text: delta }) + "\n\n");
      }
    }

    res.write("data: " + JSON.stringify({ type: "done", model }) + "\n\n");
    res.end();
  } catch (error) {
    console.error(error);

    if (res.headersSent) {
      res.write(
        "data: " +
          JSON.stringify({
            type: "error",
            error: error?.message || "The model request failed."
          }) +
          "\n\n"
      );
      res.end();
      return;
    }

    const status = error?.status && Number.isInteger(error.status) ? error.status : 500;
    res.status(status).json({ error: error?.message || "The model request failed." });
  }
});

app.get("*splat", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);

app.listen(port, () => console.log("ProjectSyntra running on port " + port));
