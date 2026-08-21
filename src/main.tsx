import './styles/fitline.css'
import './styles/hero.css'
import './styles/phone.css'
import './styles/motion.css'
import './styles/demo.css'
import './styles/mobile.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
