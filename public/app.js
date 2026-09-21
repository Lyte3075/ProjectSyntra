const $ = s => document.querySelector(s);
const messagesEl = $("#messages");
const form = $("#chatForm");
const input = $("#input");
const send = $("#send");
const historyEl = $("#chatHistory");
const chatCount = $("#chatCount");
const authButton = $("#authButton");
const authModal = $("#authModal");
const authEmail = $("#authEmail");
const authPassword = $("#authPassword");
const authSubmit = $("#authSubmit");
const signOutButton = $("#signOutButton");
const authStatus = $("#authStatus");
const loginTab = $("#loginTab");
const signupTab = $("#signupTab");
const personalityButton = $("#personalityButton");
const personalityModal = $("#personalityModal");
const personalityInput = $("#personalityInput");
const savePersonality = $("#savePersonality");
const modelSelect = $("#modelSelect");
const modelMenu = $("#modelMenu");
const fileInput = $("#fileInput");
const attachButton = $("#attachButton");
const attachmentsEl = $("#attachments");
const sidebar = $("#sidebar");
const sidebarBackdrop = $("#sidebarBackdrop");
const menuButton = $("#menuButton");

let chats = [];
let activeChatId = null;
let conversation = [];
let pendingFiles = [];
let authMode = "login";
let selectedModel = "openai/gpt-oss-20b";
let availableModels = [];
let supabaseClient = null;
let authEnabled = false;
let currentUser = null;
let busy = false;
let cloudSyncReady = false;
let syncingCloud = false;

const uid = () => crypto.randomUUID?.() || Date.now() + "-" + Math.random();
const key = () => `projectsyntra-chats:${currentUser?.id || "guest"}`;

const esc = value => String(value).replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
}[c]));

function md(text) {
  let html = esc(text);
  const blocks = [];
  html = html.replace(/\`\`\`([\s\S]*?)\`\`\`/g, (_, code) => {
    blocks.push("<pre><code>" + code.trim() + "</code></pre>");
    return "@@CODE" + (blocks.length - 1) + "@@";
  });
  html = html
    .replace(/\`([^\`\n]+)\`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
  return html.replace(/@@CODE(\d+)@@/g, (_, i) => blocks[+i]);
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function save() {
  try {
    localStorage.setItem(key(), JSON.stringify(chats));
  } catch {}
}

function normalizeChat(chat) {
  return {
    ...chat,
    updatedAt: Number(chat.updatedAt) || Date.now(),
    messages: Array.isArray(chat.messages) ? chat.messages : []
  };
}

function load() {
  try {
    chats = JSON.parse(localStorage.getItem(key()) || "[]");
  } catch {
    chats = [];
  }
  if (!Array.isArray(chats)) chats = [];
  chats = chats.map(normalizeChat);
}

async function cloudUpsert(chat) {
  if (!cloudSyncReady || !supabaseClient || !currentUser || !chat) return;
  const { error } = await supabaseClient.from("chat_sessions").upsert({
    id: chat.id,
    user_id: currentUser.id,
    title: chat.title || "New chat",
    messages: chat.messages || [],
    created_at: chat.createdAt
      ? new Date(chat.createdAt).toISOString()
      : new Date().toISOString(),
    updated_at: new Date(chat.updatedAt || Date.now()).toISOString()
  });
  if (error) console.warn("Cloud chat sync failed:", error.message);
}

async function cloudDelete(id) {
  if (!cloudSyncReady || !supabaseClient || !currentUser || !id) return;
  const { error } = await supabaseClient
    .from("chat_sessions")
    .delete()
    .eq("id", id);
  if (error) console.warn("Cloud chat delete failed:", error.message);
}

async function syncFromCloud() {
  if (!cloudSyncReady || !supabaseClient || !currentUser || syncingCloud) return;
  syncingCloud = true;

  try {
    const { data, error } = await supabaseClient
      .from("chat_sessions")
      .select("id,user_id,title,messages,created_at,updated_at")
      .order("updated_at", { ascending: false });

    if (error) {
      console.warn("Cloud chat load failed:", error.message);
      return;
    }

    const localById = new Map(chats.map(c => [c.id, normalizeChat(c)]));
    const cloudRows = Array.isArray(data) ? data : [];
    const cloudIds = new Set();

    for (const row of cloudRows) {
      cloudIds.add(row.id);
      const local = localById.get(row.id);
      const cloudUpdated = Date.parse(row.updated_at || row.created_at || "") || 0;
      const localUpdated = local?.updatedAt || 0;

      if (!local || cloudUpdated >= localUpdated) {
        localById.set(row.id, normalizeChat({
          id: row.id,
          title: row.title || "New chat",
          messages: Array.isArray(row.messages) ? row.messages : [],
          createdAt: Date.parse(row.created_at || "") || Date.now(),
          updatedAt: cloudUpdated || Date.now()
        }));
      }
    }

    chats = [...localById.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    save();

    for (const chat of chats) {
      if (!cloudIds.has(chat.id) || (localById.get(chat.id)?.updatedAt || 0) > 0) {
        await cloudUpsert(chat);
      }
    }
  } finally {
    syncingCloud = false;
  }
}

async function initializeCloudWorkspace() {
  if (!currentUser || !supabaseClient) {
    cloudSyncReady = false;
    return;
  }

  cloudSyncReady = true;
  await syncFromCloud();
}

function active() {
  return chats.find(c => c.id === activeChatId);
}

function newChat() {
  const c = {
    id: uid(),
    title: "New chat",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  chats.unshift(c);
  activeChatId = c.id;
  conversation = [];
  pendingFiles = [];
  save();
  cloudUpsert(c);
  renderHistory();
  render();
  renderAttachments();
  closeSidebar();
}

function persist() {
  const c = active();
  if (!c) return;
  c.messages = [...conversation];
  c.updatedAt = Date.now();
  const first = conversation.find(m => m.role === "user");
  if (first && c.title === "New chat") {
    c.title = first.content.slice(0, 36) + (first.content.length > 36 ? "…" : "");
  }
  save();
  cloudUpsert(c);
  renderHistory();
}

function deleteChat(id) {
  const index = chats.findIndex(c => c.id === id);
  if (index < 0) return;
  const title = chats[index].title || "this chat";
  if (!confirm("Delete " + title + "?")) return;
  chats.splice(index, 1);
  cloudDelete(id);
  if (activeChatId === id) {
    activeChatId = null;
    conversation = [];
    if (chats.length) {
      activeChatId = chats[0].id;
      conversation = [...chats[0].messages];
    } else {
      newChat();
      return;
    }
  }
  save();
  renderHistory();
  render();
}

function renameChat(id) {
  const chat = chats.find(c => c.id === id);
  if (!chat) return;
  const title = prompt("Rename chat", chat.title || "New chat");
  if (title === null) return;
  const trimmed = title.trim();
  if (!trimmed) return;
  chat.title = trimmed.slice(0, 80);
  chat.updatedAt = Date.now();
  save();
  cloudUpsert(chat);
  renderHistory();
}

function renderHistory() {
  chatCount.textContent = chats.length;
  historyEl.innerHTML = chats.map(c =>
    '<div class="history-item-wrap ' + (c.id === activeChatId ? "active" : "") + '">' +
      '<button class="history-item" data-chat-id="' + c.id + '" type="button">' +
        '<span>' + esc(c.title) + '</span>' +
        '<small>' + c.messages.length + " message" + (c.messages.length === 1 ? "" : "s") + '</small>' +
      '</button>' +
      '<div class="history-actions">' +
        '<button type="button" data-rename-chat="' + c.id + '" aria-label="Rename chat" title="Rename chat">✎</button>' +
        '<button type="button" data-delete-chat="' + c.id + '" aria-label="Delete chat" title="Delete chat">×</button>' +
      '</div>' +
    '</div>'
  ).join("");
}

function welcome() {
  return `<div class="welcome">
    <div class="welcome-icon">✦</div>
    <h2>What are we building today?</h2>
    <p>Chat, code, explore ideas, and attach text or source files when you want ProjectSyntra to work with them.</p>
    <div class="suggestions">
      <button type="button">Explain quantum computing simply</button>
      <button type="button">Help me build a JavaScript game</button>
      <button type="button">Review this idea and find edge cases</button>
    </div>
  </div>`;
}

function render() {
  messagesEl.innerHTML = "";
  if (!conversation.length) {
    messagesEl.innerHTML = welcome();
    return;
  }
  conversation.forEach((m, index) => addMessage(m.role, m.content, false, index));
}

function addMediaMessage(event) {
  document.querySelector(".welcome")?.remove();

  const row = document.createElement("div");
  row.className = "message assistant";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = "S";

  const contentWrap = document.createElement("div");
  contentWrap.className = "message-content";

  const bubble = document.createElement("div");
  bubble.className = "bubble media-bubble";

  if (event.mediaType === "video") {
    const video = document.createElement("video");
    video.className = "generated-media";
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = "data:" + (event.mimeType || "video/mp4") + ";base64," + event.data;
    bubble.appendChild(video);
  } else {
    const image = document.createElement("img");
    image.className = "generated-media";
    image.alt = "Generated image";
    image.loading = "lazy";
    image.src = "data:" + (event.mimeType || "image/png") + ";base64," + event.data;
    bubble.appendChild(image);
  }

  const label = document.createElement("div");
  label.className = "media-label";
  label.textContent = event.mediaType === "video" ? "🎬 Generated video" : "🖼️ Generated image";
  bubble.appendChild(label);

  contentWrap.appendChild(bubble);
  row.append(avatar, contentWrap);
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return row;
}

function addMessage(role, content, typing = false, index = -1) {
  document.querySelector(".welcome")?.remove();
  const row = document.createElement("div");
  row.className = "message " + role;
  if (index >= 0) row.dataset.messageIndex = index;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "user" ? "You" : "S";

  const contentWrap = document.createElement("div");
  contentWrap.className = "message-content";

  const bubble = document.createElement("div");
  bubble.className = "bubble" + (typing ? " typing" : "");
  bubble.innerHTML = role === "assistant" ? md(content) : esc(content).replace(/\n/g, "<br>");
  contentWrap.appendChild(bubble);

  if (!typing && index >= 0 && (role === "user" || role === "assistant")) {
    const actions = document.createElement("div");
    actions.className = "message-actions";
    if (role === "user") {
      actions.innerHTML = '<button type="button" data-edit-message="' + index + '">Edit</button><button type="button" data-retry-message="' + index + '">Retry</button>';
    } else {
      actions.innerHTML = '<button type="button" data-retry-message="' + index + '">↻ Retry</button>';
    }
    contentWrap.appendChild(actions);
  }

  row.append(avatar, contentWrap);
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return bubble;
}

function personality() {
  return localStorage.getItem("projectsyntra-personality") ||
    "You are ProjectSyntra, a helpful, accurate, concise AI assistant. Use Markdown when useful. Be friendly and explain things clearly.";
}

async function token() {
  if (!supabaseClient) return "";
  return (await supabaseClient.auth.getSession()).data.session?.access_token || "";
}

function renderAttachments() {
  attachmentsEl.classList.toggle("hidden", !pendingFiles.length);
  attachmentsEl.innerHTML = pendingFiles.map((f, i) =>
    `<div class="attachment">
      <span>📎</span>
      <span class="attachment-name">${esc(f.name)}</span>
      <span class="attachment-size">${formatSize(f.size)}</span>
      <button class="attachment-remove" type="button" data-remove-file="${i}" aria-label="Remove file">×</button>
    </div>`
  ).join("");
}

async function readFile(file) {
  const max = 2 * 1024 * 1024;
  if (file.size > max) throw new Error(file.name + " is too large. Keep files under 2 MB.");
  const type = file.type || "application/octet-stream";
  const multimodal = type.startsWith("image/") || type === "application/pdf";
  if (multimodal) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read " + file.name));
      reader.readAsDataURL(file);
    });
    return { name: file.name, size: file.size, type, data: String(dataUrl).split(",")[1] || "", multimodal: true };
  }
  return { name: file.name, size: file.size, type, text: await file.text(), multimodal: false };
}

async function addFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  if (pendingFiles.length + files.length > 5) {
    alert("You can attach up to 5 files at once.");
    return;
  }

  for (const file of files) {
    try {
      const parsed = await readFile(file);
      pendingFiles.push(parsed);
    } catch (error) {
      alert(error.message);
    }
  }
  renderAttachments();
}

function buildUserContent(text) {
  if (!pendingFiles.length) return text;
  const fileText = pendingFiles.map(f =>
    `\n\n--- FILE: ${f.name} ---\n\`\`\`\n${f.text}\n\`\`\``
  ).join("");
  return text + fileText;
}

function setBusy(value) {
  busy = value;
  send.disabled = value;
  send.setAttribute("aria-busy", value ? "true" : "false");
  input.disabled = false;
  attachButton.disabled = false;
}

async function requestAnswer() {
  const t = await token();
  if (authEnabled && !t) {
    throw Error("Please sign in to ProjectSyntra before sending messages.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 600000);

  let response;
  try {
    response = await fetch("/api/chat", {
      method: "POST",
      headers: Object.assign(
        { "Content-Type": "application/json" },
        t ? { Authorization: "Bearer " + t } : {}
      ),
      body: JSON.stringify({
        model: selectedModel,
        messages: [{ role: "system", content: personality() }, ...conversation],
        attachments: pendingFiles
          .filter(f => f.multimodal && f.data)
          .map(f => ({ name: f.name, mimeType: f.type, data: f.data }))
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw Error("The request took too long. The server may be waking up. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let data = {};
    try { data = await response.json(); } catch {}
    throw Error(data.error || "Request failed (" + response.status + ").");
  }

  let answer = "";
  let mediaEvent = null;
  const bubble = addMessage("assistant", "Thinking…", true);
  if (!response.body) throw Error("The server returned no response stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop();

    for (const part of parts) {
      const line = part.split("\n").find(v => v.startsWith("data: "));
      if (!line) continue;
      const event = JSON.parse(line.slice(6));

      if (event.type === "delta") {
        answer += event.text;
        bubble.classList.remove("typing");
        bubble.innerHTML = md(answer);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }

      if (event.type === "media") {
        mediaEvent = event;
        bubble.classList.remove("typing");
        bubble.innerHTML = "";
        const media = document.createElement(event.mediaType === "video" ? "video" : "img");
        media.className = "generated-media";
        if (event.mediaType === "video") {
          media.controls = true;
          media.playsInline = true;
          media.preload = "metadata";
        } else {
          media.alt = "Generated image";
          media.loading = "lazy";
        }
        media.src = "data:" + (event.mimeType || (event.mediaType === "video" ? "video/mp4" : "image/png")) + ";base64," + event.data;
        bubble.appendChild(media);
        const label = document.createElement("div");
        label.className = "media-label";
        label.textContent = event.mediaType === "video" ? "🎬 Generated video" : "🖼️ Generated image";
        bubble.appendChild(label);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }

      if (event.type === "error") throw Error(event.error);
    }
  }

  if (!answer && !mediaEvent) answer = "The model returned an empty response.";
  conversation.push({ role: "assistant", content: answer || (mediaEvent ? "[" + (mediaEvent.mediaType === "video" ? "Generated video" : "Generated image") + "]" : "") });
  persist();
}

async function sendMessage(text) {
  if (!active()) newChat();

  const userContent = buildUserContent(text);
  conversation.push({ role: "user", content: userContent });
  persist();
  addMessage("user", userContent, false, conversation.length - 1);

  const sentFiles = pendingFiles;
  pendingFiles = [];
  renderAttachments();
  setBusy(true);

  try {
    await requestAnswer();
  } catch (error) {
    const message = error?.message || "Something went wrong.";
    const bubble = addMessage("assistant", message, false, -1);
    bubble.classList.add("error-text");
    pendingFiles = sentFiles;
    renderAttachments();
  } finally {
    setBusy(false);
    input.focus();
  }
}

async function retryMessage(index) {
  if (busy) return;
  const message = conversation[index];
  if (!message) return;

  let userIndex = index;
  if (message.role === "assistant") userIndex = index - 1;
  if (!conversation[userIndex] || conversation[userIndex].role !== "user") return;

  conversation = conversation.slice(0, userIndex + 1);
  persist();
  render();

  setBusy(true);
  try {
    await requestAnswer();
  } catch (error) {
    const bubble = addMessage("assistant", error?.message || "Something went wrong.", false, -1);
    bubble.classList.add("error-text");
  } finally {
    setBusy(false);
    input.focus();
  }
}

function editMessage(index) {
  if (busy) return;
  const message = conversation[index];
  if (!message || message.role !== "user") return;

  const edited = prompt("Edit your prompt", message.content);
  if (edited === null) return;

  const trimmed = edited.trim();
  if (!trimmed) return;

  conversation = conversation.slice(0, index);
  pendingFiles = [];
  persist();
  render();
  input.value = trimmed;
  input.style.height = "auto";
  sendMessage(trimmed);
}

function open(modal) { modal.classList.remove("hidden"); }
function close(modal) { modal.classList.add("hidden"); }

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarBackdrop.classList.add("hidden");
}

function updateAuth() {
  authButton.textContent = currentUser ? "✓" : "👤";
  authButton.title = currentUser ? (currentUser.email || "Signed in") : "Account";
  signOutButton.classList.toggle("hidden", !currentUser);
  authSubmit.classList.toggle("hidden", !!currentUser);
  authEmail.classList.toggle("hidden", !!currentUser);
  authPassword.classList.toggle("hidden", !!currentUser);
  loginTab.classList.toggle("hidden", !!currentUser);
  signupTab.classList.toggle("hidden", !!currentUser);
  $("#authIntro").textContent = currentUser
    ? (currentUser.email || "Signed in")
    : "Sign in or create an account to keep your workspace separated by account.";
}

async function setup() {
  const config = await (await fetch("/api/config")).json();
  authEnabled = !!config.authEnabled;

  if (config.models?.length) {
    availableModels = config.models || [];
    selectedModel = availableModels[0].id;
    modelSelect.innerHTML = config.models[0].name + " <span>⌄</span>";
    $("#modelLabel").textContent = availableModels[0].name;
    $("#sidebarModel").textContent = availableModels[0].name;
    modelMenu.innerHTML = availableModels.map(function(m){ return "<button type=\"button\" data-model=\"" + esc(m.id) + "\"><span>" + esc(m.name) + "</span><small>" + (m.free ? "Free" : "") + "</small></button>"; }).join("");
  }

  if (authEnabled && window.supabase) {
    supabaseClient = window.supabase.createClient(
      config.supabaseUrl,
      config.supabasePublishableKey
    );
    currentUser = (await supabaseClient.auth.getUser()).data.user || null;

    supabaseClient.auth.onAuthStateChange(async (_event, session) => {
      currentUser = session?.user || null;
      cloudSyncReady = false;
      load();
      if (!active()) newChat();
      else render();
      updateAuth();

      await initializeCloudWorkspace();

      if (!active()) newChat();
      else {
        conversation = [...active().messages];
        renderHistory();
        render();
      }
    });
  }

  load();
  if (!active()) newChat();
  else {
    conversation = [...active().messages];
    renderHistory();
    render();
  }
  updateAuth();
  await initializeCloudWorkspace();
  if (!active()) newChat();
  else {
    conversation = [...active().messages];
    renderHistory();
    render();
  }
}

async function auth() {
  if (!supabaseClient) {
    authStatus.textContent = "Accounts are not enabled on the server yet. Add the Supabase variables in Render.";
    return;
  }

  const email = authEmail.value.trim();
  const password = authPassword.value;

  if (!email || password.length < 6) {
    authStatus.textContent = "Enter an email and a password with at least 6 characters.";
    return;
  }

  authSubmit.disabled = true;

  const result = authMode === "signup"
    ? await supabaseClient.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin }
      })
    : await supabaseClient.auth.signInWithPassword({ email, password });

  authSubmit.disabled = false;

  if (result.error) {
    authStatus.textContent = result.error.message;
    return;
  }

  if (authMode === "signup" && !result.data.session) {
    authStatus.textContent = "Account created. Check your email, then sign in.";
    return;
  }

  currentUser = result.data.user;
  close(authModal);
  load();
  if (!active()) newChat();
  else {
    conversation = [...active().messages];
    renderHistory();
    render();
  }
  updateAuth();
  await initializeCloudWorkspace();
  if (!active()) newChat();
  else {
    conversation = [...active().messages];
    renderHistory();
    render();
  }
}

form.addEventListener("submit", event => {
  event.preventDefault();
  const text = input.value.trim();
  if ((text || pendingFiles.length) && !send.disabled) {
    input.value = "";
    input.style.height = "auto";
    sendMessage(text || "Please review the attached file(s).");
  }
});

input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    form.requestSubmit();
  }
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 180) + "px";
});

attachButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  addFiles(fileInput.files);
  fileInput.value = "";
});

attachmentsEl.addEventListener("click", event => {
  const button = event.target.closest("[data-remove-file]");
  if (!button) return;
  pendingFiles.splice(Number(button.dataset.removeFile), 1);
  renderAttachments();
});

$("#newChat").addEventListener("click", newChat);
$("#clearChat").addEventListener("click", newChat);

historyEl.addEventListener("click", event => {
  const rename = event.target.closest("[data-rename-chat]");
  if (rename) {
    renameChat(rename.dataset.renameChat);
    return;
  }

  const del = event.target.closest("[data-delete-chat]");
  if (del) {
    deleteChat(del.dataset.deleteChat);
    return;
  }

  const item = event.target.closest("[data-chat-id]");
  if (!item) return;
  const chat = chats.find(c => c.id === item.dataset.chatId);
  if (!chat) return;
  activeChatId = chat.id;
  conversation = [...chat.messages];
  renderHistory();
  render();
  closeSidebar();
});

messagesEl.addEventListener("click", event => {
  const edit = event.target.closest("[data-edit-message]");
  if (edit) {
    editMessage(Number(edit.dataset.editMessage));
    return;
  }

  const retry = event.target.closest("[data-retry-message]");
  if (retry) retryMessage(Number(retry.dataset.retryMessage));
});

document.addEventListener("click", event => {
  const suggestion = event.target.closest(".suggestions button");
  if (suggestion) {
    input.value = suggestion.textContent;
    form.requestSubmit();
  }

  const closeButton = event.target.closest("[data-close]");
  if (closeButton) close($("#" + closeButton.dataset.close));
});

authButton.addEventListener("click", () => {
  authStatus.textContent = authEnabled ? "" : "Guest mode. Add Supabase settings in Render to enable accounts.";
  open(authModal);
});

loginTab.addEventListener("click", () => {
  authMode = "login";
  loginTab.classList.add("active");
  signupTab.classList.remove("active");
  authSubmit.textContent = "Sign in";
});

signupTab.addEventListener("click", () => {
  authMode = "signup";
  signupTab.classList.add("active");
  loginTab.classList.remove("active");
  authSubmit.textContent = "Create account";
});

authSubmit.addEventListener("click", auth);

signOutButton.addEventListener("click", async () => {
  await supabaseClient?.auth.signOut();
  cloudSyncReady = false;
  currentUser = null;
  close(authModal);
  updateAuth();
  load();
  if (!active()) newChat();
  else {
    conversation = [...active().messages];
    renderHistory();
    render();
  }
});

personalityButton.addEventListener("click", () => {
  personalityInput.value = personality();
  open(personalityModal);
});

savePersonality.addEventListener("click", () => {
  localStorage.setItem(
    "projectsyntra-personality",
    personalityInput.value.trim() || personality()
  );
  close(personalityModal);
});

modelSelect.addEventListener("click", () => modelMenu.classList.toggle("hidden"));

modelMenu.addEventListener("click", event => {
  const option = event.target.closest("[data-model]");
  if (!option) return;
  selectedModel = option.dataset.model;
  modelSelect.innerHTML = option.querySelector("span").textContent + " <span>⌄</span>";
  modelMenu.classList.add("hidden");
});

menuButton.addEventListener("click", () => {
  sidebar.classList.add("open");
  sidebarBackdrop.classList.remove("hidden");
});

sidebarBackdrop.addEventListener("click", closeSidebar);

window.addEventListener("error", event => {
  console.error("ProjectSyntra UI error:", event.error || event.message);
});

window.addEventListener("unhandledrejection", event => {
  console.error("ProjectSyntra unhandled promise rejection:", event.reason);
});

setup().catch(error => {
  console.error("ProjectSyntra setup failed:", error);
  const message = error?.message || "ProjectSyntra could not finish loading.";
  if (messagesEl) {
    messagesEl.innerHTML = '<div class="message assistant"><div class="avatar">S</div><div class="message-content"><div class="bubble error-text">' + esc(message) + '</div></div></div>';
  }
});
