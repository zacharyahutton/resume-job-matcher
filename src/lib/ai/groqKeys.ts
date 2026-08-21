/**
 * Groq API key pool. Rotate across keys so TPM limits on one org key
 * do not stall Fitline when several keys are configured.
 *
 * Supported (any combination):
 * - VITE_GROQ_API_KEY
 * - VITE_GROQ_API_KEY_2 / _3 / _4
 * - VITE_GROQ_API_KEYS=key1,key2,key3
 * - localStorage fitline_groq_key (single) or fitline_groq_keys (comma list)
 */

const API_KEY_STORAGE = 'fitline_groq_key'
const API_KEYS_STORAGE = 'fitline_groq_keys'
const LEGACY_KEY_STORAGE = 'fitline_openai_key'

let roundRobin = 0

function pushKey(bag: string[], value?: string | null) {
  if (!value) return
  // Prefer comma / newline separators. Do not split on spaces inside values.
  for (const part of String(value).split(/[,\n]+/)) {
    const t = part.trim()
    if (t.length > 10 && !bag.includes(t)) bag.push(t)
  }
}

export function getApiKeys(): string[] {
  const bag: string[] = []

  if (typeof localStorage !== 'undefined') {
    pushKey(bag, localStorage.getItem(API_KEYS_STORAGE))
    pushKey(bag, localStorage.getItem(API_KEY_STORAGE))
    pushKey(bag, localStorage.getItem(LEGACY_KEY_STORAGE))
  }

  pushKey(bag, import.meta.env.VITE_GROQ_API_KEYS)
  pushKey(bag, import.meta.env.VITE_GROQ_API_KEY)
  pushKey(bag, import.meta.env.VITE_GROQ_API_KEY_2)
  pushKey(bag, import.meta.env.VITE_GROQ_API_KEY_3)
  pushKey(bag, import.meta.env.VITE_GROQ_API_KEY_4)
  pushKey(bag, import.meta.env.VITE_OPENAI_API_KEY)

  return bag
}

/** First available key (compat with older call sites). */
export function getApiKey(): string {
  return getApiKeys()[0] || ''
}

export function hasConfiguredApiKey(): boolean {
  return getApiKeys().length > 0
}

export function setApiKey(key: string): void {
  if (typeof localStorage === 'undefined') return
  if (key.trim()) localStorage.setItem(API_KEY_STORAGE, key.trim())
  else localStorage.removeItem(API_KEY_STORAGE)
}

/** Next key in rotation (advances on every call). */
export function takeNextApiKey(): string {
  const keys = getApiKeys()
  if (!keys.length) return ''
  const key = keys[roundRobin % keys.length]
  roundRobin = (roundRobin + 1) % keys.length
  return key
}

/** Ordered key list starting at the current round-robin position. */
export function keysStartingAtRotation(): string[] {
  const keys = getApiKeys()
  if (!keys.length) return []
  const start = roundRobin % keys.length
  return [...keys.slice(start), ...keys.slice(0, start)]
}

export function advanceKeyRotation() {
  const n = getApiKeys().length
  if (n > 0) roundRobin = (roundRobin + 1) % n
}
