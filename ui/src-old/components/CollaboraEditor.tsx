import { useCallback, useEffect, useRef, useState } from 'react'
import { ProgressBar } from 'react-aria-components'
import { api } from '../api/client'

interface WopiTokenResponse {
  access_token: string
  access_token_ttl: number
  editor_url: string | null
}

interface CollaboraEditorProps {
  fileId: string
  fileName: string
  mimetype: string
  onClose?: () => void
  onSaveStatus?: (saving: boolean) => void
}

const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000 // refresh 5 min before expiry

export default function CollaboraEditor({
  fileId,
  fileName: _fileName,
  mimetype: _mimetype,
  onClose,
  onSaveStatus,
}: CollaboraEditorProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [wopiData, setWopiData] = useState<WopiTokenResponse | null>(null)
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const collaboraOriginRef = useRef<string>('*')

  // Fetch WOPI token
  const fetchToken = useCallback(async () => {
    try {
      const data = await api.post<WopiTokenResponse>('/wopi/token', { file_id: fileId })
      if (data.editor_url) {
        try { collaboraOriginRef.current = new URL(data.editor_url).origin } catch { /* keep wildcard */ }
      }
      setWopiData(data)
      return data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get editor token')
      return null
    }
  }, [fileId])

  // Schedule token refresh
  const scheduleTokenRefresh = useCallback(
    (tokenTtl: number) => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
      }

      const ttlMs = tokenTtl - Date.now()
      const refreshInMs = Math.max(ttlMs - TOKEN_REFRESH_MARGIN_MS, 0)

      refreshTimerRef.current = setTimeout(async () => {
        const data = await fetchToken()
        if (data && iframeRef.current?.contentWindow) {
          // Send new token to Collabora iframe via postMessage
          iframeRef.current.contentWindow.postMessage(
            JSON.stringify({
              MessageId: 'Action_ResetAccessToken',
              Values: {
                token: data.access_token,
                token_ttl: String(data.access_token_ttl),
              },
            }),
            collaboraOriginRef.current,
          )
          scheduleTokenRefresh(data.access_token_ttl)
        }
      }, refreshInMs)
    },
    [fetchToken],
  )

  // Fetch token on mount
  useEffect(() => {
    let cancelled = false
    fetchToken().then((data) => {
      if (!cancelled && data) {
        scheduleTokenRefresh(data.access_token_ttl)
      }
    })
    return () => {
      cancelled = true
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
      }
    }
  }, [fetchToken, scheduleTokenRefresh])

  // Submit form to iframe AFTER React has committed both the form and iframe to the DOM.
  // This useEffect fires when wopiData changes — by that point refs are assigned.
  // If we submit before the iframe with name="collabora_frame" is in the DOM,
  // the browser opens the POST in the main window and navigates away from the SPA.
  useEffect(() => {
    if (wopiData?.editor_url && formRef.current && iframeRef.current) {
      formRef.current.submit()
    }
  }, [wopiData])

  // PostMessage listener for Collabora communication
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Validate origin — only accept messages from Collabora
      if (collaboraOriginRef.current !== '*' && event.origin !== collaboraOriginRef.current) return

      let data: { MessageId?: string; Values?: Record<string, unknown> }
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      } catch {
        return
      }

      if (!data || !data.MessageId) return

      switch (data.MessageId) {
        case 'App_LoadingStatus':
          if (data.Values?.Status === 'Document_Loaded') {
            setLoading(false)
            // Focus the iframe once the document is loaded
            iframeRef.current?.focus()
          }
          break

        case 'UI_Close':
          onClose?.()
          break

        case 'Action_Save_Resp':
          onSaveStatus?.(false)
          setSaveStatus('All changes saved')
          break

        case 'Action_Save':
          onSaveStatus?.(true)
          setSaveStatus('Saving...')
          break
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [onClose, onSaveStatus])

  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#e74c3c', fontSize: '1.1rem' }}>Failed to load editor</p>
          <p style={{ color: '#666' }}>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {loading && (
        <div
          data-testid="collabora-loading"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#fff',
            zIndex: 10,
          }}
        >
          <ProgressBar aria-label="Loading editor" isIndeterminate>
            <div className="spinner" style={{ fontSize: '1.2rem', color: '#666' }}>
              Loading editor...
            </div>
          </ProgressBar>
        </div>
      )}

      {/* Save status live region */}
      <div
        aria-live="polite"
        role="status"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}
      >
        {saveStatus}
      </div>

      {wopiData && wopiData.editor_url && (
        <form
          ref={formRef}
          data-testid="collabora-form"
          target="collabora_frame"
          action={wopiData.editor_url!}
          encType="multipart/form-data"
          method="post"
          style={{ display: 'none' }}
        >
          <input name="access_token" value={wopiData.access_token} type="hidden" readOnly />
          <input name="access_token_ttl" value={String(wopiData.access_token_ttl)} type="hidden" readOnly />
        </form>
      )}

      <iframe
        ref={iframeRef}
        data-testid="collabora-iframe"
        name="collabora_frame"
        title="Collabora Editor"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
        }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
        allow="clipboard-read *; clipboard-write *"
        allowFullScreen
      />
    </div>
  )
}
