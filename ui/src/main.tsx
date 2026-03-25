import React from 'react'
import ReactDOM from 'react-dom/client'
import '@gouvfr-lasuite/cunningham-react/icons'
import '@gouvfr-lasuite/cunningham-react/style'
import App from './App'

// Load theme AFTER Cunningham styles so our :root overrides win by source order.
// Only load from integration service when running on a real domain (not localhost).
const origin = window.location.origin
if (!origin.includes('localhost') && !origin.includes('127.0.0.1')) {
  const integrationOrigin = origin.replace(/^https?:\/\/driver\./, 'https://integration.')
  const themeLink = document.createElement('link')
  themeLink.rel = 'stylesheet'
  themeLink.href = integrationOrigin + '/api/v2/theme.css'
  document.head.appendChild(themeLink)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
