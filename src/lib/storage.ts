import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { StoredResume } from '@/types'
import {
  getApiKey,
  getApiKeys,
  hasConfiguredApiKey,
  setApiKey,
} from '@/lib/ai/groqKeys'

export { getApiKey, getApiKeys, hasConfiguredApiKey, setApiKey }

/** IndexedDB row: store file bytes as ArrayBuffer (Blobs are flaky across sessions in some browsers). */
interface ResumeRecord {
  id: string
  fileName: string
  mimeType: string
  savedAt: number
  text: string
  bytes: ArrayBuffer
  /** Legacy field from older Fitline builds */
  blob?: Blob
}

interface FitlineDB extends DBSchema {
  resume: {
    key: string
    value: ResumeRecord
  }
  meta: {
    key: string
    value: string
  }
}

const DB_NAME = 'fitline-db'
const DB_VERSION = 2
const RESUME_KEY = 'current'
const MIRROR_KEY = 'fitline_resume_mirror_v1'

let dbPromise: Promise<IDBPDatabase<FitlineDB>> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<FitlineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('resume')) {
          db.createObjectStore('resume')
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta')
        }
      },
    })
  }
  return dbPromise
}

function toStored(record: ResumeRecord): StoredResume {
  let blob: Blob
  if (record.bytes && record.bytes.byteLength > 0) {
    blob = new Blob([record.bytes], { type: record.mimeType || 'application/octet-stream' })
  } else if (record.blob) {
    blob = record.blob
  } else {
    blob = new Blob([record.text || ''], { type: 'text/plain' })
  }
  return {
    id: record.id || RESUME_KEY,
    fileName: record.fileName,
    mimeType: record.mimeType,
    savedAt: record.savedAt,
    text: record.text,
    blob,
  }
}

interface MirrorPayload {
  fileName: string
  mimeType: string
  savedAt: number
  text: string
  /** Base64 of file bytes when small enough for localStorage */
  bytesB64?: string
}

function bytesToBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes)
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < view.length; i += chunk) {
    binary += String.fromCharCode(...view.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function base64ToBytes(b64: string): ArrayBuffer {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out.buffer
}

function writeMirror(payload: MirrorPayload): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify(payload))
  } catch {
    // Quota: keep text-only so analysis still works after reload.
    try {
      localStorage.setItem(
        MIRROR_KEY,
        JSON.stringify({
          fileName: payload.fileName,
          mimeType: payload.mimeType,
          savedAt: payload.savedAt,
          text: payload.text,
        } satisfies MirrorPayload),
      )
    } catch {
      /* ignore */
    }
  }
}

function readMirror(): StoredResume | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(MIRROR_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as MirrorPayload
    if (!data?.text || !data.fileName) return null
    const bytes = data.bytesB64 ? base64ToBytes(data.bytesB64) : new TextEncoder().encode(data.text).buffer
    return toStored({
      id: RESUME_KEY,
      fileName: data.fileName,
      mimeType: data.mimeType || 'text/plain',
      savedAt: data.savedAt || Date.now(),
      text: data.text,
      bytes,
    })
  } catch {
    return null
  }
}

function clearMirror(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(MIRROR_KEY)
  } catch {
    /* ignore */
  }
}

export async function saveResume(resume: Omit<StoredResume, 'id'>): Promise<StoredResume> {
  const bytes = await resume.blob.arrayBuffer()
  const record: ResumeRecord = {
    id: RESUME_KEY,
    fileName: resume.fileName,
    mimeType: resume.mimeType || 'application/octet-stream',
    savedAt: resume.savedAt || Date.now(),
    text: resume.text,
    bytes,
  }

  let idbOk = false
  try {
    const db = await getDb()
    await db.put('resume', record, RESUME_KEY)
    const check = await db.get('resume', RESUME_KEY)
    idbOk = Boolean(check?.text)
  } catch {
    idbOk = false
  }

  // Always mirror text (+ bytes when small) so a reload still has the resume
  // even if IndexedDB is blocked (private mode, Safari quirks, etc.).
  const mirror: MirrorPayload = {
    fileName: record.fileName,
    mimeType: record.mimeType,
    savedAt: record.savedAt,
    text: record.text,
  }
  if (bytes.byteLength > 0 && bytes.byteLength <= 1_800_000) {
    try {
      mirror.bytesB64 = bytesToBase64(bytes)
    } catch {
      /* skip bytes in mirror */
    }
  }
  writeMirror(mirror)

  if (!idbOk && !readMirror()?.text) {
    throw new Error(
      'Could not save your resume on this device. Allow site data / storage for Fitline, then try again.',
    )
  }

  return toStored(record)
}

export async function getResume(): Promise<StoredResume | null> {
  try {
    const db = await getDb()
    const row = await db.get('resume', RESUME_KEY)
    if (row?.text) {
      // Prefer IDB; keep mirror in sync for next time
      const stored = toStored(row)
      if (!row.bytes && row.blob) {
        try {
          const bytes = await row.blob.arrayBuffer()
          await db.put(
            'resume',
            {
              id: RESUME_KEY,
              fileName: stored.fileName,
              mimeType: stored.mimeType,
              savedAt: stored.savedAt,
              text: stored.text,
              bytes,
            },
            RESUME_KEY,
          )
        } catch {
          /* keep legacy blob row */
        }
      }
      return stored
    }
  } catch {
    /* fall through to mirror */
  }
  return readMirror()
}

export async function removeResume(): Promise<void> {
  clearMirror()
  try {
    const db = await getDb()
    await db.delete('resume', RESUME_KEY)
  } catch {
    /* mirror already cleared */
  }
}
