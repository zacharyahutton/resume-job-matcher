import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { StoredResume } from '@/types'
import {
  getApiKey,
  getApiKeys,
  hasConfiguredApiKey,
  setApiKey,
} from '@/lib/ai/groqKeys'

export { getApiKey, getApiKeys, hasConfiguredApiKey, setApiKey }

interface FitlineDB extends DBSchema {
  resume: {
    key: string
    value: {
      id: string
      fileName: string
      mimeType: string
      savedAt: number
      text: string
      blob: Blob
    }
  }
  meta: {
    key: string
    value: string
  }
}

const DB_NAME = 'fitline-db'
const DB_VERSION = 1
const RESUME_KEY = 'current'

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

export async function saveResume(resume: Omit<StoredResume, 'id'>): Promise<StoredResume> {
  const db = await getDb()
  const record: StoredResume = { ...resume, id: RESUME_KEY }
  await db.put('resume', record, RESUME_KEY)
  return record
}

export async function getResume(): Promise<StoredResume | null> {
  const db = await getDb()
  return (await db.get('resume', RESUME_KEY)) ?? null
}

export async function removeResume(): Promise<void> {
  const db = await getDb()
  await db.delete('resume', RESUME_KEY)
}
