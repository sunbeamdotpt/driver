import { useState } from 'react'
import { Button } from '@gouvfr-lasuite/cunningham-react'
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components'
import { type FileRecord } from '../api/files'
import { api } from '../api/client'

interface ShareDialogProps {
  file: FileRecord
  isOpen: boolean
  onClose: () => void
}

type PermissionLevel = 'viewer' | 'editor' | 'owner'

interface ShareEntry {
  email: string
  permission: PermissionLevel
}

export default function ShareDialog({ file, isOpen, onClose }: ShareDialogProps) {
  const [email, setEmail] = useState('')
  const [permission, setPermission] = useState<PermissionLevel>('viewer')
  const [shares, setShares] = useState<ShareEntry[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAddShare = async () => {
    if (!email.trim()) return
    setIsSubmitting(true)
    setError(null)

    try {
      await api.post(`/files/${file.id}/share`, {
        email: email.trim(),
        permission,
      })
      setShares([...shares, { email: email.trim(), permission }])
      setEmail('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRemoveShare = async (shareEmail: string) => {
    try {
      await api.delete(`/files/${file.id}/share/${encodeURIComponent(shareEmail)}`)
      setShares(shares.filter((s) => s.email !== shareEmail))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove share')
    }
  }

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => { if (!open) onClose() }}
      isDismissable
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        zIndex: 1000,
      }}
    >
      <Modal
        style={{
          backgroundColor: 'var(--c--theme--colors--greyscale-000)',
          borderRadius: 8,
          boxShadow: '0 8px 40px rgba(0,0,0,0.16)',
          width: '100%',
          maxWidth: 560,
          maxHeight: '85vh',
          overflow: 'auto',
          outline: 'none',
        }}
      >
        <Dialog
          aria-label={`Share "${file.filename}"`}
          style={{ outline: 'none', padding: 24 }}
        >
          {({ close }) => (
            <>
              <Heading
                slot="title"
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  margin: '0 0 16px 0',
                  color: 'var(--c--theme--colors--greyscale-800)',
                }}
              >
                Share &ldquo;{file.filename}&rdquo;
              </Heading>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Add new share */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 12,
                        fontWeight: 600,
                        marginBottom: 4,
                        color: 'var(--c--theme--colors--greyscale-600)',
                      }}
                    >
                      Email or User ID
                    </label>
                    <input
                      type="text"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="user@example.com"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddShare() }}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 4,
                        border: '1px solid var(--c--theme--colors--greyscale-300)',
                        fontSize: 14,
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 12,
                        fontWeight: 600,
                        marginBottom: 4,
                        color: 'var(--c--theme--colors--greyscale-600)',
                      }}
                    >
                      Permission
                    </label>
                    <select
                      value={permission}
                      onChange={(e) => setPermission(e.target.value as PermissionLevel)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 4,
                        border: '1px solid var(--c--theme--colors--greyscale-300)',
                        fontSize: 14,
                        backgroundColor: 'var(--c--theme--colors--greyscale-000)',
                      }}
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      <option value="owner">Owner</option>
                    </select>
                  </div>

                  <Button
                    color="brand"
                    size="small"
                    onClick={handleAddShare}
                    disabled={isSubmitting || !email.trim()}
                  >
                    Share
                  </Button>
                </div>

                {error && (
                  <div style={{ color: 'var(--c--theme--colors--danger-400)', fontSize: 13 }}>
                    {error}
                  </div>
                )}

                {/* Current shares */}
                {shares.length > 0 && (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--c--theme--colors--greyscale-700)' }}>
                      Shared with
                    </div>
                    {shares.map((share) => (
                      <div
                        key={share.email}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 0',
                          borderBottom: '1px solid var(--c--theme--colors--greyscale-100)',
                        }}
                      >
                        <div>
                          <span style={{ fontSize: 14 }}>{share.email}</span>
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: 12,
                              color: 'var(--c--theme--colors--greyscale-500)',
                              textTransform: 'capitalize',
                            }}
                          >
                            {share.permission}
                          </span>
                        </div>
                        <button
                          onClick={() => handleRemoveShare(share.email)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--c--theme--colors--danger-400)',
                            fontSize: 12,
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                <Button color="neutral" onClick={() => { close(); onClose(); }}>
                  Done
                </Button>
              </div>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  )
}
