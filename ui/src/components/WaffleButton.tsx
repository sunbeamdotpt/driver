import { useEffect, useRef } from 'react'

const origin = window.location.origin
const isLocalDev = origin.includes('localhost') || origin.includes('127.0.0.1')
const INTEGRATION_ORIGIN = isLocalDev ? '' : origin.replace(/^https?:\/\/driver\./, 'https://integration.')

/**
 * La Gaufre waffle menu button.
 *
 * Uses the official lagaufre.js widget from the integration service.
 * The widget creates a Shadow DOM popup with suite service links.
 * The button uses the `lasuite-gaufre-btn--vanilla` CSS classes for the
 * mask-image waffle icon, and passes itself as `buttonElement` to the
 * widget init so click/toggle/popup are handled by the script.
 */
export default function WaffleButton() {
  const btnRef = useRef<HTMLButtonElement>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current || !INTEGRATION_ORIGIN) return
    initialized.current = true

    // Load the lagaufre widget script (it embeds its own popup CSS)
    const script = document.createElement('script')
    script.src = `${INTEGRATION_ORIGIN}/api/v2/lagaufre.js`
    script.onload = () => {
      // Initialize the widget, passing our button element
      window._lasuite_widget = window._lasuite_widget || []
      window._lasuite_widget.push(['lagaufre', 'init', {
        api: `${INTEGRATION_ORIGIN}/api/v2/services.json`,
        buttonElement: btnRef.current!,
        label: 'Sunbeam Studios',
        closeLabel: 'Close',
        newWindowLabelSuffix: ' \u00b7 new window',
      }])
      // Mark loaded so the CSS visibility rule kicks in
      document.documentElement.classList.add('lasuite--gaufre-loaded')
    }
    document.head.appendChild(script)

    return () => {
      window._lasuite_widget = window._lasuite_widget || []
      window._lasuite_widget.push(['lagaufre', 'destroy'])
    }
  }, [])

  // The button uses official La Suite CSS classes:
  // - lasuite-gaufre-btn: base (hidden until .lasuite--gaufre-loaded on <html>)
  // - lasuite-gaufre-btn--vanilla: styled with mask-image waffle icon
  // - lasuite-gaufre-btn--small: compact variant
  // - js-lasuite-gaufre-btn: JS hook (though we pass buttonElement directly)
  return (
    <button
      ref={btnRef}
      type="button"
      className="lasuite-gaufre-btn lasuite-gaufre-btn--vanilla lasuite-gaufre-btn--small js-lasuite-gaufre-btn"
      title="Apps"
      aria-label="Apps"
      aria-expanded="false"
      aria-controls="lasuite-gaufre-popup"
      style={{
        borderRadius: 10,
        boxShadow: 'inset 0 0 0 1px var(--c--theme--colors--greyscale-200, rgba(255,255,255,0.1))',
      }}
    >
      Apps
    </button>
  )
}

declare global {
  interface Window {
    _lasuite_widget: unknown[] & { _loaded?: Record<string, number> }
  }
}
