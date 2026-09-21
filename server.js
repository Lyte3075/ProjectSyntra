import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

if (!process.env.TOKENRA_API_KEY) {
  console.warn("TOKENRA_API_KEY is not set. Add it as a server environment variable.");
}

const client = new OpenAI({
  baseURL: "https://tokenra.io/v1",
  apiKey: process.env.TOKENRA_API_KEY
});

app.disable("x-powered-by");

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public"), {
  extensions: ["html"]
}));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    model: "union-alpha",
    configured: Boolean(process.env.TOKENRA_API_KEY)
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages must be a non-empty array." });
    }

    if (!process.env.TOKENRA_API_KEY) {
      return res.status(503).json({ error: "The server API key has not been configured yet." });
    }

    const safeMessages = messages
      .filter(m => m && (m.role === "system" || m.role === "user" || m.role === "assistant"))
      .map(m => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content.slice(0, 50000) : ""
      }))
      .filter(m => m.content);

    if (!safeMessages.length) {
      return res.status(400).json({ error: "No valid messages were provided." });
    }

    const completion = await client.chat.completions.create({
      model: "union-alpha",
      messages: safeMessages,
      max_tokens: 4096,
      temperature: 0.7
    });

    const message = completion.choices?.[0]?.message?.content ?? "";

    res.json({
      message,
      usage: completion.usage ?? null,
      model: completion.model ?? "union-alpha"
    });
  } catch (error) {
    console.error(error);
    const status = error?.status && Number.isInteger(error.status) ? error.status : 500;
    res.status(status).json({
      error: error?.message || "The model request failed."
    });
  }
});

app.get("*splat", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`ProjectSyntra running on port ${port}`);
});