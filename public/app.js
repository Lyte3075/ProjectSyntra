const messagesEl = document.querySelector("#messages");
const form = document.querySelector("#chatForm");
const input = document.querySelector("#input");
const send = document.querySelector("#send");
const newChat = document.querySelector("#newChat");
const clearChat = document.querySelector("#clearChat");

const STORAGE_KEY = "projectsyntra-conversation";
let conversation = [];

function saveConversation() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(conversation));
  } catch {}
}

function removeWelcome() {
  document.querySelector(".welcome")?.remove();
}

function addMessage(role, content) {
  removeWelcome();

  const row = document.createElement("div");
  row.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "user" ? "You" : "S";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = content;

  row.append(avatar, bubble);
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  return bubble;
}

function renderConversation() {
  messagesEl.innerHTML = "";
  if (!conversation.length) {
    showWelcome();
    return;
  }

  for (const message of conversation) {
    addMessage(message.role, message.content);
  }
}

function showWelcome() {
  messagesEl.innerHTML = `
    <div class="welcome">
      <div class="welcome-icon">✦</div>
      <h2>What are we building today?</h2>
      <p>Chat with Union Alpha from your phone, tablet, or computer. Your conversation stays in this browser until you start a new chat.</p>
      <div class="suggestions">
        <button type="button">Explain quantum computing simply</button>
        <button type="button">Help me build a JavaScript game</button>
        <button type="button">Review this idea and find edge cases</button>
      </div>
    </div>
  `;
}

function loadConversation() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(saved)) {
      conversation = saved.filter(
        message =>
          message &&
          (message.role === "user" || message.role === "assistant") &&
          typeof message.content === "string"
      );
    }
  } catch {
    conversation = [];
  }
  renderConversation();
}

function setBusy(value) {
  send.disabled = value;
  input.disabled = value;
  if (!value) input.focus();
}

async function sendMessage(text) {
  conversation.push({ role: "user", content: text });
  saveConversation();
  addMessage("user", text);

  const bubble = addMessage("assistant", "Thinking…");
  bubble.classList.add("typing");
  setBusy(true);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: "You are Union Alpha, a helpful, accurate, concise AI assistant. Use Markdown when useful."
          },
          ...conversation
        ]
      })
    });

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("The server returned an invalid response.");
    }

    if (!response.ok) {
      throw new Error(data.error || "Request failed.");
    }

    const answer = data.message || "The model returned an empty response.";
    bubble.classList.remove("typing");
    bubble.textContent = answer;
    conversation.push({ role: "assistant", content: answer });
    saveConversation();
  } catch (error) {
    bubble.classList.remove("typing");
    bubble.textContent = `Error: ${error.message}`;
    conversation.pop();
    saveConversation();
  } finally {
    setBusy(false);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || send.disabled) return;

  input.value = "";
  input.style.height = "auto";
  await sendMessage(text);
});

input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    form.requestSubmit();
  }
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
});

function resetChat() {
  conversation = [];
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
  showWelcome();
  input.focus();
}

newChat?.addEventListener("click", resetChat);
clearChat?.addEventListener("click", resetChat);

document.addEventListener("click", event => {
  const button = event.target.closest(".suggestions button");
  if (!button) return;
  input.value = button.textContent;
  form.requestSubmit();
});

loadConversation();