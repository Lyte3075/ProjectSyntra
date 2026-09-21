# ProjectSyntra 🤖

**ProjectSyntra** is a responsive AI chat website powered by **Groq**, with optional **Supabase authentication** and a modern chat interface for web, mobile, tablet, and desktop.

🌐 **Live website:** https://projectsyntra.onrender.com/

## ✨ Features

- 💬 AI chat powered by Groq
- ⚡ Streaming AI responses
- 📝 Markdown rendering
- 💻 Formatted code blocks
- 🔄 Retry AI responses
- ✏️ Edit previously sent prompts
- 🗂️ Multiple chat histories
- ✏️ Rename chats
- 🗑️ Delete chats
- 🧠 Custom AI personality
- 🤖 Model selector
- 📎 Text/source-file attachments
- 🔐 Account sign-up and sign-in with Supabase
- 📱 Responsive mobile, tablet, and desktop UI
- 🌓 Dark, modern interface
- 🚀 Render-ready Express backend
- 🔒 AI API key stays server-side

## 🌐 Live Demo

Visit ProjectSyntra here:

**https://projectsyntra.onrender.com/**

## 🧰 Tech Stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js + Express
- **AI:** Groq API
- **Authentication:** Supabase Auth
- **Hosting:** Render
- **Repository:** GitHub

## 📁 Project Structure

```text
ProjectSyntra/
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── server.js
├── package.json
└── README.md
```

## 🚀 Local Setup

### Requirements

- Node.js 20+
- A Groq API key
- A Supabase project if you want account authentication

### Install

```bash
npm install
```

### Configure environment variables

Create a `.env` file:

```env
GROQ_API_KEY=your_groq_key_here
SUPABASE_URL=your_supabase_project_url
SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
PORT=3000
```

**Never commit `.env` or expose your API key in client-side code.**

### Run

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

For development:

```bash
npm run dev
```

## 🤖 AI Configuration

ProjectSyntra currently uses:

- **Provider:** Groq
- **Model:** `openai/gpt-oss-20b`
- **API compatibility:** OpenAI-compatible chat completions
- **Streaming:** Enabled

The Groq API key is used only by the server and is never intentionally sent to the browser.

## 🔐 Authentication

ProjectSyntra can use Supabase Auth for account creation and sign-in.

The frontend receives only the Supabase **publishable key**. The AI provider key remains server-side.

For production authentication, configure the Supabase URL configuration with your live ProjectSyntra URL:

```text
https://projectsyntra.onrender.com/
```

Email confirmation redirects should also be configured to use the live site.

## 💬 Chat Features

### Chat history

ProjectSyntra supports multiple conversations. Chats can be:

- Created
- Selected
- Renamed
- Deleted

### Prompt editing

Previously sent user prompts can be edited. Editing a prompt rebuilds the conversation from that point and sends the updated prompt to the AI.

### Retry

AI responses can be regenerated with the **Retry** button. You can also retry from an earlier point in a conversation.

### File attachments

Text and source files can be attached to a prompt. The current implementation reads supported text files in the browser and includes their contents in the request.

## ☁️ Production Deployment

ProjectSyntra is deployed as an Express Web Service on Render.

Typical Render configuration:

- **Runtime:** Node
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Branch:** `main`

Required production environment variables:

- `GROQ_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Render automatically redeploys when changes are pushed to the connected GitHub branch.

## 🔒 Security

Never put secrets in:

- `public/app.js`
- `public/index.html`
- `public/style.css`
- GitHub commits
- Screenshots
- Public posts

Use server-side environment variables for secret credentials.

If an API key is accidentally exposed, revoke it and generate a replacement.

## 📌 Current Storage Note

Chat histories are currently stored in the browser's local storage and separated by the active account/guest workspace.

This means the current chat history is **not yet synchronized between different devices**.

A future database-backed chat history system can move conversations into Supabase so authenticated users can access the same chats across devices.

## 🛠️ Project Status

ProjectSyntra is an actively developed project. Features and architecture may change as the project grows.

---

**ProjectSyntra** • Build. Chat. Create. 🚀
