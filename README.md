Web Runner — AI website generator (starter scaffold)

Web Runner is a free, no-login website generator UI built around gpt-pilot. This scaffold shows a complete local/dev setup and an approach for deploying the frontend to Vercel and the backend to Render (or any Docker host). Important: users bring their own LLM API keys (Google AI Studio / PaLM). The system never stores users' keys centrally — they paste them into their browser and the key is forwarded only for the generation request.

Highlights
- Frontend (Next.js + Monaco) with:
  - Prompt input and "Are you not a robot?" simple checkbox anti-bot
  - User API key input with instructions on how to get a free Google AI Studio key
  - Monaco editor, file tree, live iframe preview, ZIP export
  - Save file edits, live preview refresh
- Backend (Express) with:
  - Workspace management, file listing, read/patch, preview static serving, zip export
  - /api/generate accepts userApiKey (forwarded to gpt-pilot or used if calling Google AI directly)
  - Simple anti-bot timing check
- Templates:
  - templates/minimal (index.html + styles)
  - templates/react-vite-tailwind (Vite + React + Tailwind starter)
- Docker Compose for local dev, README with Render deployment notes

How users use the site (what we show in the UI)
1. Get a free API key from Google AI Studio:
   - Visit https://studio.google.com/
   - Sign in with Google and create a project.
   - Enable the PaLM / Text Generation API if prompted.
   - Create an API key or service account key for the PaLM or Vertex AI "Text Generation" API and copy it.

NOTE: Google’s free tier / trial may give you some free credits. Keep an eye on quotas. You are responsible for your own usage and costs.

2. In Web Runner UI:
   - Paste the API key into the "Google AI Studio API Key" input. This is saved only in your browser (localStorage) and is not sent to our servers except as part of generation requests you make for your own session.
   - Type your website idea in natural language.
   - Confirm "Are you not a robot?" checkbox.
   - Click Generate. The frontend sends the prompt and your API key to the backend, which forwards it to gpt-pilot (or calls the LLM endpoint via the gpt-pilot wrapper).
   - After generation, view files in the editor, modify, save, see live preview, and export ZIP.

Security note
- The API key you paste is stored in your browser localStorage and forwarded on-demand to the backend to perform generation. The backend will not persist the key. If you deploy the backend yourself, you can remove the forwarding behavior and call your model provider directly from the client if you prefer.
- For public deployments, consider adding rate-limiting and optionally stronger captcha to reduce abuse.

Render deployment notes (short)
- Deploy the frontend to Vercel (Next.js) using the provided frontend/ folder.
- Deploy the backend to Render as a web service or to any VPS:
  - Build a Docker image based on backend/Dockerfile (or use the docker-compose example).
  - In Render, set environment variables (WORKSPACES_DIR, GPT_PILOT_BASE_URL, etc.)
  - The backend needs writable filesystem to store workspaces (or mount network storage).
- The user-provided API keys are pasted by each user into the frontend; the backend does not require a global LLM API key to be configured (unless you want server-side model calls or internal provider fallback).

Local quickstart
- Clone repo
- Copy backend/.env.example -> backend/.env and adjust values if needed (GPT_PILOT_BASE_URL)
- Run gpt-pilot (see backend/README.md)
- Start backend: docker-compose up --build
- Start frontend (in frontend/): npm install && npm run dev
- Visit http://localhost:3000

If you want, I can also add a small gpt-pilot HTTP wrapper and push it as a separate service.