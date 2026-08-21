/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GROQ_API_KEY?: string
  readonly VITE_GROQ_API_KEY_2?: string
  readonly VITE_GROQ_API_KEY_3?: string
  readonly VITE_GROQ_API_KEY_4?: string
  /** Comma-separated Groq keys (optional alternative to _2/_3/_4). */
  readonly VITE_GROQ_API_KEYS?: string
  readonly VITE_OPENAI_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
