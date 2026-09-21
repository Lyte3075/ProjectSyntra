import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT) || 10000;
const model = "openai/gpt-oss-20b";
const geminiModel = "gemini-3.6-flash";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabasePublishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const authEnabled = Boolean(supabaseUrl && supabasePublishableKey);

if (!process.env.GROQ_API_KEY) console.warn("GROQ_API_KEY is not set.");
if (!process.env.GEMINI_API_KEY) console.warn("GEMINI_API_KEY is not set. Image/file understanding will be unavailable.");
if (!authEnabled) console.warn("Supabase auth is disabled.");

const gemini = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

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
app.set("etag", false);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  next();
});

app.use(express.json({ limit: "12mb" }));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

app.get("/api/config", (_req, res) =>
  res.json({
    authEnabled,
    supabaseUrl: authEnabled ? supabaseUrl : null,
    supabasePublishableKey: authEnabled ? supabasePublishableKey : null,
    models: [
      { id: "auto", name: "Auto", free: true, description: "Chooses the best available model for each request" },
      { id: model, name: "GPT-OSS 20B", free: true },
      { id: geminiModel, name: "Gemini 3.6 Flash", free: true, multimodal: true }
    ]
  })
);

app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    model,
    configured: Boolean(process.env.GROQ_API_KEY),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
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

function latestUserPrompt(messages) {
  return [...messages].reverse().find(m => m.role === "user")?.content || "";
}

function chooseModel({ messages, attachments }) {
  if (attachments.length) return geminiModel;

  const prompt = latestUserPrompt(messages).toLowerCase();

  const visionOrMedia = /\b(image|photo|picture|screenshot|pdf|document|diagram|chart|visual|look at|see this|analyze this)\b/.test(prompt);
  const deepReasoning = /\b(reason|reasoning|prove|proof|derive|derivation|debug|debugging|analyze|analysis|compare|comparison|math|mathematics|algorithm|architecture|edge case|trade-?off|explain why)\b/.test(prompt);
  const creative = /\b(write|rewrite|story|poem|lyrics|creative|brainstorm|idea|ideas|name|names|concept|script|dialogue)\b/.test(prompt);
  const coding = /\b(code|coding|program|programming|javascript|typescript|python|html|css|sql|api|function|bug|error|compile|compiler|syntax|repository|github|singulax)\b/.test(prompt);

  if (visionOrMedia || deepReasoning) return geminiModel;
  if (coding || creative) return model;

  return model;
}

async function createGeminiStream(contents) {
  if (!gemini) {
    throw Object.assign(new Error("Gemini is not configured on the server."), { status: 503 });
  }

  const delays = [1500, 3000, 6000];
  let lastError;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await gemini.models.generateContentStream({
        model: geminiModel,
        contents
      });
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || error?.code);
      const message = String(error?.message || "");
      const retryable = status === 503 || /\bUNAVAILABLE\b|high demand|temporarily|overload/i.test(message);

      if (!retryable || attempt === delays.length) throw error;

      console.warn(
        "Gemini temporarily unavailable. Retrying in " +
          delays[attempt] +
          "ms (attempt " +
          (attempt + 2) +
          "/" +
          (delays.length + 1) +
          ")."
      );

      await new Promise(resolve => setTimeout(resolve, delays[attempt]));
    }
  }

  throw lastError;
}

async function streamGemini({ messages, attachments, res }) {
  if (!gemini) throw Object.assign(new Error("Gemini is not configured on the server."), { status: 503 });

  const parts = [];
  const systemMessage = messages.find(m => m.role === "system");
  const recentMessages = messages.filter(m => m.role !== "system").slice(-30);

  if (systemMessage?.content) {
    parts.push({ text: "System instructions:\n" + systemMessage.content.slice(0, 20000) });
  }

  for (const message of recentMessages) {
    const label = message.role === "assistant" ? "Assistant" : "User";
    if (message.content) parts.push({ text: label + ":\n" + message.content.slice(0, 50000) });
  }

  for (const file of attachments) {
    if (!file || typeof file.data !== "string" || typeof file.mimeType !== "string") continue;
    if (file.data.length > 8_000_000) continue;
    parts.push({
      inlineData: {
        mimeType: file.mimeType,
        data: file.data
      }
    });
    parts.push({ text: "The attachment above is named: " + String(file.name || "attachment").slice(0, 200) });
  }

  parts.push({
    text: "Respond to the user's latest request. You are the multimodal side of ProjectSyntra. Analyze attached images/documents/files when present. Use Markdown when useful."
  });

  const stream = await createGeminiStream(parts);

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  for await (const chunk of stream) {
    const text = chunk.text || "";
    if (text) {
      res.write("data: " + JSON.stringify({ type: "delta", text }) + "\n\n");
    }
  }

  res.write("data: " + JSON.stringify({ type: "done", model: geminiModel }) + "\n\n");
  res.end();
}

app.post("/api/chat", async (req, res) => {
  const user = await authenticate(req, res);
  if (!user) return;

  try {
    const { messages, model: requestedModel, attachments = [] } = req.body;

    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: "messages must be a non-empty array." });
    }

    const safeAttachments = Array.isArray(attachments) ? attachments.slice(0, 5) : [];
    const hasAttachments = safeAttachments.length > 0;
    const effectiveModel =
      requestedModel === "auto" || !requestedModel
        ? chooseModel({ messages, attachments: safeAttachments })
        : requestedModel;

    if (hasAttachments && !process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: "Gemini is not configured yet. Add GEMINI_API_KEY in Render." });
    }

    if (effectiveModel === model && !process.env.GROQ_API_KEY) {
      return res.status(503).json({ error: "The server API key has not been configured yet." });
    }

    if (effectiveModel === geminiModel && !process.env.GEMINI_API_KEY) {
      if (requestedModel === "auto" || !requestedModel) {
        console.warn("Auto routing selected Gemini, but Gemini is unavailable. Falling back to GPT-OSS 20B.");
      } else {
        return res.status(503).json({ error: "Gemini is not configured yet. Add GEMINI_API_KEY in Render." });
      }
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

    const autoMode = requestedModel === "auto" || !requestedModel;
    const useGemini = effectiveModel === geminiModel && Boolean(process.env.GEMINI_API_KEY);

    if (useGemini) {
      return await streamGemini({
        messages: safeMessages,
        attachments: safeAttachments,
        res
      });
    }

    if (hasAttachments) {
      return res.status(503).json({
        error: "This request includes an attachment, so ProjectSyntra needs Gemini for multimodal processing."
      });
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

const server = app.listen(port, "0.0.0.0", () => console.log("ProjectSyntra running on port " + port));
server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;
