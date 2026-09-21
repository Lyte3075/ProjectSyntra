# Union Alpha Chat 🤖

A standalone GitHub-ready chatbot using **Union Alpha** through TokenRa's OpenAI-compatible API.

## Features

- Clean responsive chat UI
- Conversation history during the current session
- New chat / clear chat controls
- API key stays on the server
- Node.js + Express backend
- OpenAI-compatible Union Alpha API
- No frontend framework required

## 1. Requirements

- Node.js 18+
- A TokenRa API key with access to `union-alpha`

## 2. Install

```bash
npm install
```

## 3. Add your API key

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Then put your **new** API key in `.env`:

```env
TOKENRA_API_KEY=your_key_here
PORT=3000
```

Never commit `.env`.

## 4. Run

```bash
npm start
```

Open:

```text
http://localhost:3000
```

For development:

```bash
npm run dev
```

## API configuration

The server uses:

- Base URL: `https://tokenra.io/v1`
- Model: `union-alpha`
- Endpoint: `/chat/completions`

The API key is intentionally never sent to the browser.

## Deploying

This project can be deployed to a Node-compatible host. Set `TOKENRA_API_KEY` as a server-side environment variable in the host's dashboard rather than committing `.env`.

## Security note

The API key previously pasted into chat should be considered exposed. Revoke it and create a replacement before using this project.

Union Alpha is a third-party model served through TokenRa. Check the provider's current terms, limits, retention policy, and availability before using it for sensitive or production data.