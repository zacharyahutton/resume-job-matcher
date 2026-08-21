# Fitline

Resume tailoring aimed at one outcome: help you get the interview for the job you want. Built on the visual language of the Zubaz SaaS template, fully redesigned for this product.

**Get the interview. Keep the truth.**

## What it does

- Upload resume once (PDF / DOCX / TXT / image OCR), stored in IndexedDB on-device
- Add a job via screenshot OCR, paste, or typed requirements
- Staged pipeline: resume extraction → job extraction → matching → feedback → tailoring → download
- Clear feedback on what helps you get the interview, and what to fix
- Tailored PDF/DOCX from your real experience only (never invents skills)

## Quick start

```bash
npm install
npm run dev
```

Open the local URL Vite prints (usually `http://localhost:5173`).

### Optional AI key

Fitline uses **Groq**. For local or production, set `VITE_GROQ_API_KEY` in `.env` or your host env (Vercel, etc.). There is no API key field in the public UI.

Without a key, a local matcher still runs for demos.

## Scripts

| Command           | Description              |
|-------------------|--------------------------|
| `npm run dev`     | Start development server |
| `npm run build`   | Production build         |
| `npm run preview` | Preview production build |

## Stack

React + TypeScript + Vite · IndexedDB (`idb`) · Tesseract.js · pdf.js · mammoth · docx · jsPDF · Zod · Groq structured JSON (optional)

## Privacy

Resume files and text stay in the browser. Server-side AI uses an env-configured key, not a user-facing key field.
