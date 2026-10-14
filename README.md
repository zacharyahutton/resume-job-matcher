# resume-job-matcher

A React app that compares a resume with a job posting, shows which requirements you already meet and which you are missing, and then exports a tailored DOCX or PDF built only from your real experience.

Most resume tools I tried either rewrote everything in generic language or quietly added skills the person did not have. I wanted something that tells you honestly where you stand and only rewords and reorders what is already true.

## Features

- Upload a resume once as PDF, DOCX, TXT or an image (OCR). It is stored in IndexedDB in your browser, not on a server.
- Add a job by pasting the text, typing requirements, or uploading a screenshot of the posting
- Requirement by requirement match with a fit score and plain feedback
- Tailored resume export to DOCX and PDF that keeps the original layout where possible
- Works without an API key using a local keyword and skill matcher, so the full flow can be demoed offline
- Optional Groq LLM stages for better extraction and matching, with key rotation when one key hits its rate limit

## Stack

React 19, TypeScript, Vite, React Router, Zod, IndexedDB (`idb`), pdf.js, mammoth, Tesseract.js, docx, jsPDF, JSZip.

## How it works

The analysis runs as a staged pipeline in `src/lib/ai/pipeline.ts`:

1. **Extract resume**: parse text from the uploaded file (`parseResume.ts`, `ocr.ts`) and turn it into a structured profile.
2. **Extract job**: pull requirements out of the posting and validate the input (`jobInputGuard.ts`).
3. **Match**: compare each requirement with the resume (`stages/matchRequirements.ts`).
4. **Assess fit**: score the match and write feedback (`stages/assessFit.ts`).
5. **Plan and tailor**: decide what to reword or reorder, then apply the changes to the original text (`stages/planTailor.ts`, `preserveFormat.ts`, `tailorDocx.ts`).
6. **Export**: build the DOCX and PDF downloads (`generateDocs.ts`).

Every stage has a local fallback in `localEngine.ts`, and every LLM response is validated with Zod before it is used.

## Setup

```bash
git clone https://github.com/zacharyahutton/resume-job-matcher.git
cd resume-job-matcher
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

To use the LLM stages, copy `.env.example` to `.env` and set `VITE_GROQ_API_KEY`. Note that `VITE_` variables end up in the browser bundle, so only use a key you are fine exposing for a demo. Without a key the local matcher runs.

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Type check and production build |
| `npm run preview` | Preview the production build |

## Project structure

```
src/
  pages/          Home, Resume, Analyze, Results, Privacy, Terms
  components/     resume upload, job input, analysis results, layout
  hooks/          resume storage and analysis state
  lib/
    ai/           pipeline, stages, Groq client and key pool, local engine
    parseResume.ts, ocr.ts, preserveFormat.ts, tailorDocx.ts, generateDocs.ts
  types/          shared TypeScript types
```

## Roadmap

- Move LLM calls behind a small server endpoint so no key ships to the browser
- Unit tests for the local matcher and the format-preserving rewrite
- Side by side diff view of original and tailored resume
