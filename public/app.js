const messagesEl = document.querySelector("#messages");
const form = document.querySelector("#chatForm");
const input = document.querySelector("#input");
const send = document.querySelector("#send");
const newChat = document.querySelector("#newChat");
const clearChat = document.querySelector("#clearChat");

let conversation = [];

function removeWelcome() {
  document.querySelector(".welcome")?.remove();
}

function addMessage(role, content) {
  removeWelcome();

  const row = document.createElement("div");
  row.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "user" ? "You" : "U";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = content;

  row.append(avatar, bubble);
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  return bubble;
}

function setBusy(value) {
  send.disabled = value;
  input.disabled = value;
}

async function sendMessage(text) {
  conversation.push({ role: "user", content: text });
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

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Request failed.");
    }

    const answer = data.message || "The model returned an empty response.";
    bubble.classList.remove("typing");
    bubble.textContent = answer;
    conversation.push({ role: "assistant", content: answer });
  } catch (error) {
    bubble.classList.remove("typing");
    bubble.textContent = `Error: ${error.message}`;
    conversation.pop();
  } finally {
    setBusy(false);
    input.focus();
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || send.disabled) return;

  input.value = "";
  input.style.height = "auto";
  await sendMessage(text);
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
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
  messagesEl.innerHTML = `
    <div class="welcome">
      <div class="welcome-icon">✦</div>
      <h2>What are we building today?</h2>
      <p>Ask Union Alpha anything. Your conversation is kept in this browser until you start a new chat.</p>
      <div class="suggestions">
        <button>Explain quantum computing simply</button>
        <button>Help me build a JavaScript game</button>
        <button>Review this idea and find edge cases</button>
      </div>
    </div>
  `;
}

newChat.addEventListener("click", resetChat);
clearChat.addEventListener("click", resetChat);

document.addEventListener("click", (event) => {
  const button = event.target.closest(".suggestions button");
  if (!button) return;
  input.value = button.textContent;
  form.requestSubmit();
});