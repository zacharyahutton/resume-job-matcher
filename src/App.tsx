import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Preloader } from '@/components/layout/Preloader'
import { ScrollToTop } from '@/components/layout/ScrollToTop'
import { AnalysisProvider } from '@/hooks/useAnalysisResult'
import { HomePage } from '@/pages/HomePage'
import { ResumePage } from '@/pages/ResumePage'
import { AnalyzePage } from '@/pages/AnalyzePage'
import { ResultsPage } from '@/pages/ResultsPage'
import { PrivacyPage } from '@/pages/PrivacyPage'
import { TermsPage } from '@/pages/TermsPage'

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AnalysisProvider>
        <Preloader />
        <Header />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/resume" element={<ResumePage />} />
          <Route path="/analyze" element={<AnalyzePage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Footer />
      </AnalysisProvider>
    </BrowserRouter>
  )
}
