/**
 * Rebuilds the canonical Fitline resume DOCX with corrected contact/copy.
 * Run: node scripts/build-clean-template.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from 'docx'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outPath = path.join(__dirname, '..', 'public', 'assets', 'templates', 'zachary-resume.docx')

const FONT = 'Times New Roman'
const rule = {
  bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 },
}

function name(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({ text, bold: true, size: 36, font: FONT })],
  })
}

function contact(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
    children: [new TextRun({ text, size: 20, font: FONT })],
  })
}

function heading(text) {
  return new Paragraph({
    spacing: { before: 200, after: 120 },
    border: rule,
    children: [new TextRun({ text, bold: true, size: 24, font: FONT, allCaps: true })],
  })
}

function body(text) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text, size: 22, font: FONT })],
  })
}

function bullet(text) {
  return new Paragraph({
    spacing: { after: 60 },
    indent: { left: 288 },
    children: [
      new TextRun({ text: '• ', size: 22, font: FONT }),
      new TextRun({ text, size: 22, font: FONT }),
    ],
  })
}

function job(title, dates) {
  return new Paragraph({
    spacing: { before: 120, after: 60 },
    tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
    children: [
      new TextRun({ text: title, bold: true, size: 22, font: FONT }),
      new TextRun({ text: `\t${dates}`, size: 22, font: FONT }),
    ],
  })
}

const children = [
  name('ZACHARY HUTTON'),
  contact('Portmore, Jamaica | hzach577@gmail.com | (876) 370-1398'),
  contact(
    'Portfolio: zachary-hutton-portfolio.vercel.app | GitHub: github.com/zacharyahutton | LinkedIn: linkedin.com/in/zachary-hutton-a2ab81415',
  ),
  heading('SUMMARY'),
  body(
    'Software developer with 3 years of freelance and contract experience building production systems in Python, TypeScript, and JavaScript. Strong at debugging complex flows, implementing features end-to-end, refactoring for maintainability, and writing clean, well-documented code suitable as a reference standard. Comfortable working independently remotely and producing reproducible technical work with clear problem statements and solution write-ups.',
  ),
  heading('TECHNICAL SKILLS'),
  body('Languages: Python, TypeScript, JavaScript, Java, SQL, Bash, HTML/CSS'),
  body(
    'Core strengths: Debugging & root-cause analysis, feature development, refactoring, API design, performance-conscious delivery, technical documentation',
  ),
  body('Backend: FastAPI, Node.js, Express, REST APIs, webhooks, JWT auth, async Python, Pydantic'),
  body('Frontend: React, Next.js, TypeScript, Tailwind CSS, component architecture'),
  body(
    'Data & tools: MongoDB, SQLite, Git, GitHub Actions, Vercel, Railway, Docker (basics), Linux CLI',
  ),
  body(
    'AI-adjacent: LLM API integrations (Groq/OpenAI), fallback routing, evaluation-minded response handling',
  ),
  heading('EXPERIENCE'),
  job('Software Developer (Contract), weROI', '2024 — Present'),
  bullet('Build and maintain production apps with React, Next.js, FastAPI, and MongoDB.'),
  bullet(
    'Debug complex issues across frontend, API, auth, and deployment; ship maintainable feature enhancements.',
  ),
  bullet(
    'Design REST APIs, JWT auth, webhooks, and LLM-assisted chat (GrowthIQ) with operational fallbacks.',
  ),
  bullet(
    'Refactor modules for clarity/reuse; document implementation approaches; deploy on Vercel and Railway.',
  ),
  job('Freelance Web Developer, Independent', '2023 — Present'),
  bullet(
    'Client delivery: bug fixes, feature implementation, backend integrations, and React/TypeScript frontends.',
  ),
  bullet(
    'Own scoping, implementation, testing, and handoff documentation in remote independent workflows.',
  ),
  bullet(
    'Production Telegram bots with FastAPI webhooks, rate limiting, SQLite persistence, and LLM chat.',
  ),
  bullet('3 years combined contract and freelance delivery (2023—present).'),
  heading('SELECTED PROJECTS'),
  job('weROI Agency Platform | weroi.net', '2024 — Present'),
  bullet(
    'Full-stack production platform (React/TypeScript, FastAPI/Python, MongoDB): lead capture, audits, admin dashboard, JWT auth, Resend email; clean architecture and reference-quality validation/error handling.',
  ),
  job(
    'Telegram Demo Bot | t.me/zachtedempbot · github.com/zacharyahutton/telegram-bot-demo',
    '2024 — Present',
  ),
  bullet(
    'Live bot for booking, tickets, FAQ, and LLM chat; FastAPI webhooks, secret-token auth, rate limiting, fallbacks; open-source reproducible Railway deployment.',
  ),
  job('Webhook Relay API (Personal)', '2024'),
  bullet(
    'Outbound webhooks with API-key auth, HMAC signing, retry backoff, and per-key rate limiting; focused on correctness under failure.',
  ),
  job('Phone Store REST API (Personal)', '2024'),
  bullet(
    'Node.js/Express commerce API with JWT auth, MongoDB catalog, stock reservation, and HMAC-signed order webhooks.',
  ),
  job('PNTCOG Ministry Platform', '2024 — Present'),
  bullet(
    'Production React/TypeScript site with modular architecture, accessible forms, and mobile-first performance on Vercel.',
  ),
  heading('EDUCATION'),
  job('BSc Computer Science (in progress), University of Technology, Jamaica', 'Sep 2025 — May 2029'),
  body(
    "GPA: 3.7 | Dean's List | Focus: algorithms & data structures, databases, OOP, software engineering",
  ),
  job('Ardenne High School', 'Sep 2020 — Jul 2025'),
  body('CSEC: Grade I across subjects (IT, Mathematics, Additional Mathematics, Physics)'),
  heading('ACHIEVEMENTS'),
  bullet("Dean's List, UTech BSc Computer Science (GPA 3.7)"),
  bullet('Shipped and maintained production software for agency and ministry clients'),
  bullet('Independent remote delivery with clear documentation and scoped handoffs'),
]

const doc = new Document({
  sections: [
    {
      properties: {
        page: {
          margin: { top: 720, right: 720, bottom: 720, left: 720 },
        },
      },
      children,
    },
  ],
})

const buf = await Packer.toBuffer(doc)
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, buf)
console.log('Wrote', outPath, buf.length, 'bytes')
