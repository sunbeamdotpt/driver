import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import CollaboraEditor from '../components/CollaboraEditor'

interface FileMetadata {
  id: string
  filename: string
  mimetype: string
  parent_id: string | null
}

export default function Editor() {
  const { fileId } = useParams<{ fileId: string }>()
  const navigate = useNavigate()
  const [file, setFile] = useState<FileMetadata | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Fetch file metadata
  useEffect(() => {
    if (!fileId) return

    let cancelled = false

    const fetchFile = async () => {
      try {
        const data = await api.get<{ file: FileMetadata } | FileMetadata>(`/files/${fileId}`)
        const f = 'file' in data ? data.file : data
        if (!cancelled) setFile(f)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load file')
      }
    }

    fetchFile()

    return () => {
      cancelled = true
    }
  }, [fileId])

  // Update last_opened in user_file_state
  useEffect(() => {
    if (!fileId) return
    api.put(`/files/${fileId}/favorite`, { last_opened: new Date().toISOString() }).catch(() => {
      // Non-critical, silently ignore
    })
  }, [fileId])

  const handleClose = useCallback(() => {
    if (file?.parent_id) {
      navigate(`/explorer/${file.parent_id}`)
    } else {
      navigate('/explorer')
    }
  }, [file, navigate])

  const handleSaveStatus = useCallback((isSaving: boolean) => {
    setSaving(isSaving)
  }, [])

  if (!fileId) {
    return <div style={{ padding: '2rem' }}>No file ID provided.</div>
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#e74c3c' }}>Error: {error}</p>
        <button onClick={() => navigate('/explorer')}>Back to Explorer</button>
      </div>
    )
  }

  if (!file) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
        }}
      >
        Loading...
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <CollaboraEditor
        fileId={fileId}
        fileName={file.filename}
        mimetype={file.mimetype}
        onClose={handleClose}
        onSaveStatus={handleSaveStatus}
      />
    </div>
  )
}
