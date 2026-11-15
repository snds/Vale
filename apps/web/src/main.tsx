import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './app/icons'
import App from './App.tsx'
import { startBuildWatch } from './lib/build-watch-dom'
import { watchKeyboardInset } from './lib/keyboard-inset'
import { watchThemeColor } from './lib/theme-color'

watchKeyboardInset()
watchThemeColor()
// On a server (a gateway, the static demo): learn of a newer build and reload when it is safe (ADR-0091).
startBuildWatch()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
