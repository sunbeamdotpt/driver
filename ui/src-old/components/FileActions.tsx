import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Modal, ModalSize } from '@gouvfr-lasuite/cunningham-react'
import {
  Menu,
  MenuItem,
  Separator,
} from 'react-aria-components'
import { useDeleteFile, useToggleFavorite, useUpdateFile, type FileRecord } from '../api/files'
import { getAssetType } from '../hooks/useAssetType'

interface FileActionsProps {
  file: FileRecord
  onClose: () => void
  position?: { x: number; y: number }
  mode?: 'context' | 'dropdown'
  isTrash?: boolean
}

export default function FileActions({ file, onClose, position, mode = 'context', isTrash = false }: FileActionsProps) {
  const navigate = useNavigate()
  const deleteFile = useDeleteFile()
  const toggleFavorite = useToggleFavorite()
  const updateFile = useUpdateFile()
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [renameValue, setRenameValue] = useState(file.filename)

  const assetType = getAssetType(file.filename, file.mimetype)
  const canEditInCollabora = assetType.canEdit && !file.is_folder

  const handleAction = (key: React.Key) => {
    switch (key) {
      case 'download':
        window.open(`/api/files/${file.id}/download`, '_blank')
        onClose()
        break
      case 'open-collabora':
        navigate(`/edit/${file.id}`)
        onClose()
        break
      case 'rename':
        setShowRenameModal(true)
        break
      case 'move':
        setShowMoveModal(true)
        break
      case 'toggle-favorite':
        toggleFavorite.mutate(file.id)
        onClose()
        break
      case 'delete':
        setShowDeleteConfirm(true)
        break
    }
  }

  const handleRename = () => {
    if (renameValue && renameValue !== file.filename) {
      updateFile.mutate({ id: file.id, filename: renameValue })
    }
    setShowRenameModal(false)
    onClose()
  }

  const handleDelete = () => {
    deleteFile.mutate(file.id)
    setShowDeleteConfirm(false)
    onClose()
  }

  const popoverStyle: React.CSSProperties = mode === 'context' && position
    ? {
        position: 'fixed',
        top: position.y,
        left: position.x,
        zIndex: 1000,
      }
    : {
        position: 'absolute',
        right: 0,
        top: '100%',
        zIndex: 1000,
      }

  return (
    <>
      {/* Backdrop to close menu on outside click */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 999,
        }}
      />

      {/* Menu rendered at context position */}
      <div style={popoverStyle}>
        <Menu
          aria-label="File actions"
          onAction={handleAction}
          autoFocus="first"
          onClose={onClose}
          style={{
            backgroundColor: 'var(--c--theme--colors--greyscale-000)',
            border: '1px solid var(--c--theme--colors--greyscale-200)',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            padding: '4px 0',
            minWidth: 180,
            outline: 'none',
          }}
        >
          {!isTrash && !file.is_folder && (
            <MenuItem
              id="download"
              textValue="Download"
              style={({ isFocused }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                fontSize: 14,
                color: 'var(--c--theme--colors--greyscale-800)',
                cursor: 'pointer',
                outline: 'none',
                backgroundColor: isFocused ? 'var(--c--theme--colors--greyscale-100)' : 'transparent',
              })}
            >
              <span className="material-icons" aria-hidden="true" style={{ fontSize: 18 }}>download</span>
              Download
            </MenuItem>
          )}
          {!isTrash && canEditInCollabora && (
            <MenuItem
              id="open-collabora"
              textValue="Open in Collabora"
              style={({ isFocused }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                fontSize: 14,
                color: 'var(--c--theme--colors--greyscale-800)',
                cursor: 'pointer',
                outline: 'none',
                backgroundColor: isFocused ? 'var(--c--theme--colors--greyscale-100)' : 'transparent',
              })}
            >
              <span className="material-icons" aria-hidden="true" style={{ fontSize: 18 }}>edit</span>
              Open in Collabora
            </MenuItem>
          )}
          {!isTrash && (
            <>
              <MenuItem
                id="rename"
                textValue="Rename"
                style={({ isFocused }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  fontSize: 14,
                  color: 'var(--c--theme--colors--greyscale-800)',
                  cursor: 'pointer',
                  outline: 'none',
                  backgroundColor: isFocused ? 'var(--c--theme--colors--greyscale-100)' : 'transparent',
                })}
              >
                <span className="material-icons" aria-hidden="true" style={{ fontSize: 18 }}>drive_file_rename_outline</span>
                Rename
              </MenuItem>
              <MenuItem
                id="move"
                textValue="Move"
                style={({ isFocused }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  fontSize: 14,
                  color: 'var(--c--theme--colors--greyscale-800)',
                  cursor: 'pointer',
                  outline: 'none',
                  backgroundColor: isFocused ? 'var(--c--theme--colors--greyscale-100)' : 'transparent',
                })}
              >
                <span className="material-icons" aria-hidden="true" style={{ fontSize: 18 }}>drive_file_move</span>
                Move
              </MenuItem>
              <Separator style={{ margin: '4px 0', border: 'none', borderTop: '1px solid var(--c--theme--colors--greyscale-200)' }} />
              <MenuItem
                id="toggle-favorite"
                textValue={file.favorited ? 'Remove from favorites' : 'Add to favorites'}
                style={({ isFocused }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  fontSize: 14,
                  color: 'var(--c--theme--colors--greyscale-800)',
                  cursor: 'pointer',
                  outline: 'none',
                  backgroundColor: isFocused ? 'var(--c--theme--colors--greyscale-100)' : 'transparent',
                })}
              >
                <span className="material-icons" aria-hidden="true" style={{ fontSize: 18 }}>
                  {file.favorited ? 'star' : 'star_outline'}
                </span>
                {file.favorited ? 'Remove from favorites' : 'Add to favorites'}
              </MenuItem>
              <Separator style={{ margin: '4px 0', border: 'none', borderTop: '1px solid var(--c--theme--colors--greyscale-200)' }} />
            </>
          )}
          <MenuItem
            id="delete"
            textValue="Delete"
            style={({ isFocused }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              fontSize: 14,
              color: 'var(--c--theme--colors--danger-400)',
              cursor: 'pointer',
              outline: 'none',
              backgroundColor: isFocused ? 'var(--c--theme--colors--greyscale-100)' : 'transparent',
            })}
          >
            <span className="material-icons" aria-hidden="true" style={{ fontSize: 18 }}>delete</span>
            Delete
          </MenuItem>
        </Menu>
      </div>

      {/* Rename Modal */}
      {showRenameModal && (
        <Modal
          isOpen
          onClose={() => { setShowRenameModal(false); onClose() }}
          size={ModalSize.SMALL}
          title="Rename"
          actions={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button color="neutral" onClick={() => { setShowRenameModal(false); onClose() }}>Cancel</Button>
              <Button color="brand" onClick={handleRename}>Rename</Button>
            </div>
          }
        >
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRename() }}
            autoFocus
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 4,
              border: '1px solid var(--c--theme--colors--greyscale-300)',
              fontSize: 14,
            }}
          />
        </Modal>
      )}

      {/* Delete confirmation Modal */}
      {showDeleteConfirm && (
        <Modal
          isOpen
          onClose={() => { setShowDeleteConfirm(false); onClose() }}
          size={ModalSize.SMALL}
          title="Delete file"
          actions={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button color="neutral" onClick={() => { setShowDeleteConfirm(false); onClose() }}>Cancel</Button>
              <Button color="brand" onClick={handleDelete}>Delete</Button>
            </div>
          }
        >
          <p>Are you sure you want to delete &quot;{file.filename}&quot;?{!isTrash && ' It will be moved to trash.'}</p>
        </Modal>
      )}

      {/* Move Modal (placeholder) */}
      {showMoveModal && (
        <Modal
          isOpen
          onClose={() => { setShowMoveModal(false); onClose() }}
          size={ModalSize.MEDIUM}
          title="Move to..."
          actions={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button color="neutral" onClick={() => { setShowMoveModal(false); onClose() }}>Cancel</Button>
              <Button color="brand" disabled>Move</Button>
            </div>
          }
        >
          <p style={{ color: 'var(--c--theme--colors--greyscale-500)' }}>
            Folder tree selector will be implemented in a future update.
          </p>
        </Modal>
      )}
    </>
  )
}
