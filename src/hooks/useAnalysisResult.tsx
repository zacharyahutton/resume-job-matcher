import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { AnalysisResult } from '@/types'

interface AnalysisContextValue {
  result: AnalysisResult | null
  setResult: (r: AnalysisResult | null) => void
}

const AnalysisContext = createContext<AnalysisContextValue | null>(null)

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const value = useMemo(() => ({ result, setResult }), [result])
  return <AnalysisContext.Provider value={value}>{children}</AnalysisContext.Provider>
}

export function useAnalysisResult() {
  const ctx = useContext(AnalysisContext)
  if (!ctx) throw new Error('useAnalysisResult must be used within AnalysisProvider')
  return ctx
}
