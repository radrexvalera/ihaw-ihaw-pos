import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { fitIosStandaloneScreen, registerServiceWorker, requestPersistentStorage } from './pwa/pwa'

registerServiceWorker()
fitIosStandaloneScreen()
void requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
