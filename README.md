# ProjectSyntra 🤖

A responsive AI chat website powered by **Union Alpha** through TokenRa's OpenAI-compatible API.

## What it includes

- 📱 Responsive phone, tablet, and desktop UI
- 🌐 Full-stack Express site, ready for public hosting
- 🔐 API key stays server-side
- 💬 Conversation history during the current browser session
- 📲 Mobile Safari / Android-friendly viewport and safe-area handling
- 🧩 Installable web-app metadata
- ❤️ Health endpoint at `/api/health`
- 🚀 GitHub-friendly deployment

## Local setup

### Requirements

- Node.js 20+
- A TokenRa API key with access to `union-alpha`

### Install

```bash
npm install
```

### Configure the API key

Copy `.env.example` to `.env` and add your replacement API key:

```env
TOKENRA_API_KEY=your_key_here
PORT=3000
```

**Never commit `.env`.**

### Run

```bash
npm start
```

Open `http://localhost:3000`.

For development:

```bash
npm run dev
```

## API configuration

The server uses:

- Base URL: `https://tokenra.io/v1`
- Model: `union-alpha`
- Endpoint: `/chat/completions`

The API key is never sent to the browser.

## Deploying to Render

Render can deploy an Express Node app as a Web Service and automatically redeploy it when the connected Git branch changes.

Use:

- **Runtime:** Node
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Branch:** `main`
- **Environment Variable:** `TOKENRA_API_KEY` = your replacement API key

After deployment, Render gives the service a public `onrender.com` URL.

## Deploying to Vercel

Vercel supports Express deployment from a Git repository with zero configuration. Import this repository, then add:

`TOKENRA_API_KEY` = your replacement API key

Vercel can then deploy the Express app and serve the `public/` assets from the same project.

## Security

The API key previously pasted into chat should be considered exposed. Revoke it and use a newly generated key before deployment.

Never place the TokenRa key in:

- `public/app.js`
- `public/index.html`
- client-side JavaScript
- GitHub commits
- screenshots or public posts

Set it only as a server-side environment variable.

## Important production note

This starter does not include accounts, a database, per-user quotas, moderation, or persistent cloud chat history. Conversation history is kept in the browser session only.

Union Alpha is a third-party model served through TokenRa. Check the provider's current terms, limits, retention policy, and availability before using sensitive or production data.