import { useCallback, useEffect, useState } from 'react'

interface FilePreviewProps {
  fileId: string
  filename: string
  mimetype: string
  downloadUrl: string
  onClose?: () => void
}

function isTextMimetype(mimetype: string): boolean {
  if (mimetype.startsWith('text/')) return true
  return ['application/json', 'application/xml', 'application/javascript'].includes(mimetype)
}

function TextPreview({ downloadUrl }: { downloadUrl: string }) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(downloadUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`)
        return res.text()
      })
      .then((text) => {
        if (!cancelled) setContent(text)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [downloadUrl])

  if (error) return <p style={{ color: '#e74c3c' }}>Error loading file: {error}</p>
  if (content === null) return <p>Loading...</p>

  return (
    <pre
      data-testid="text-preview"
      style={{
        maxHeight: '70vh',
        overflow: 'auto',
        background: '#f5f5f5',
        padding: '1rem',
        borderRadius: '4px',
        fontSize: '0.875rem',
        lineHeight: 1.5,
        margin: 0,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      <code>{content}</code>
    </pre>
  )
}

function FallbackPreview({
  filename,
  mimetype,
  downloadUrl,
}: {
  filename: string
  mimetype: string
  downloadUrl: string
}) {
  return (
    <div
      data-testid="fallback-preview"
      style={{
        textAlign: 'center',
        padding: '3rem',
      }}
    >
      <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>
        <span role="img" aria-label="file">
          {'\u{1F4C4}'}
        </span>
      </div>
      <h3 style={{ margin: '0 0 0.5rem' }}>{filename}</h3>
      <p style={{ color: '#666', margin: '0 0 1.5rem' }}>{mimetype}</p>
      <a
        href={downloadUrl}
        download={filename}
        style={{
          display: 'inline-block',
          padding: '0.75rem 1.5rem',
          background: '#000091',
          color: '#fff',
          borderRadius: '4px',
          textDecoration: 'none',
        }}
      >
        Download
      </a>
    </div>
  )
}

export default function FilePreview({
  fileId: _fileId,
  filename,
  mimetype,
  downloadUrl,
  onClose,
}: FilePreviewProps) {
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose?.()
      }
    },
    [onClose],
  )

  const renderPreview = () => {
    if (mimetype.startsWith('image/')) {
      return (
        <img
          data-testid="image-preview"
          src={downloadUrl}
          alt={filename}
          style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }}
        />
      )
    }

    if (mimetype.startsWith('video/')) {
      return (
        <video
          data-testid="video-preview"
          controls
          src={downloadUrl}
          style={{ maxWidth: '100%', maxHeight: '80vh' }}
        >
          Your browser does not support the video element.
        </video>
      )
    }

    if (mimetype.startsWith('audio/')) {
      return <audio data-testid="audio-preview" controls src={downloadUrl} />
    }

    if (mimetype === 'application/pdf') {
      return (
        <iframe
          data-testid="pdf-preview"
          src={downloadUrl}
          title={filename}
          style={{ width: '100%', height: '80vh', border: 'none' }}
        />
      )
    }

    if (isTextMimetype(mimetype)) {
      return <TextPreview downloadUrl={downloadUrl} />
    }

    return <FallbackPreview filename={filename} mimetype={mimetype} downloadUrl={downloadUrl} />
  }

  return (
    <div
      data-testid="file-preview-overlay"
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '8px',
          padding: '1.5rem',
          maxWidth: '90vw',
          maxHeight: '90vh',
          overflow: 'auto',
          position: 'relative',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{filename}</h2>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close preview"
              style={{
                background: 'none',
                border: 'none',
                fontSize: '1.5rem',
                cursor: 'pointer',
                padding: '0 0.25rem',
                lineHeight: 1,
              }}
            >
              {'\u00D7'}
            </button>
          )}
        </div>

        {renderPreview()}
      </div>
    </div>
  )
}
