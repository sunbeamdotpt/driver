import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import prettyBytes from 'pretty-bytes'
import {
  GridList,
  GridListItem,
} from 'react-aria-components'
import type { Selection } from 'react-aria-components'
import { type FileRecord } from '../api/files'
import { useSelectionStore } from '../stores/selection'
import AssetTypeBadge from './AssetTypeBadge'
import { getAssetType } from '../hooks/useAssetType'
import FileActions from './FileActions'

interface FileBrowserProps {
  files: FileRecord[]
  isLoading?: boolean
  isTrash?: boolean
  showRestore?: boolean
  onRestore?: (id: string) => void
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

const GRID_COLS = '1fr 110px 90px 110px 90px'
const GRID_COLS_TRASH = '1fr 110px 90px 110px 90px 80px'

export default function FileBrowser({ files, isLoading, isTrash = false, onRestore }: FileBrowserProps) {
  const navigate = useNavigate()
  const { selectedIds, clear, selectAll } = useSelectionStore()
  const [contextMenu, setContextMenu] = useState<{ file: FileRecord; x: number; y: number } | null>(null)

  const sorted = useMemo(() => {
    if (!files || files.length === 0) return []
    return [...files].sort((a, b) => {
      if (a.is_folder && !b.is_folder) return -1
      if (!a.is_folder && b.is_folder) return 1
      return a.filename.localeCompare(b.filename)
    })
  }, [files])

  const fileById = useMemo(() => {
    const map = new Map<string, FileRecord>()
    for (const f of sorted) map.set(f.id, f)
    return map
  }, [sorted])

  const handleAction = useCallback((key: React.Key) => {
    const file = fileById.get(String(key))
    if (!file) return
    if (file.is_folder) {
      navigate(`/explorer/${file.id}`)
    } else {
      const { canEdit, canPreview } = getAssetType(file.filename, file.mimetype)
      if (canEdit) {
        window.open(`/edit/${file.id}`, '_blank')
      } else if (canPreview) {
        window.open(`/api/files/${file.id}/download`, '_blank')
      } else {
        window.open(`/api/files/${file.id}/download`, '_blank')
      }
    }
  }, [fileById, navigate])

  const handleSelectionChange = useCallback((keys: Selection) => {
    if (keys === 'all') {
      selectAll(sorted.map((f) => f.id))
    } else {
      clear()
      const ids = [...keys].map(String)
      if (ids.length > 0) selectAll(ids)
    }
  }, [sorted, clear, selectAll])

  const ariaSelectedKeys = useMemo<Selection>(() => new Set(selectedIds), [selectedIds])
  const cols = isTrash && onRestore ? GRID_COLS_TRASH : GRID_COLS

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 24px',
        color: 'var(--c--theme--colors--greyscale-500)',
        gap: 12,
      }}>
        <span className="material-icons" aria-hidden="true" style={{ fontSize: 28, opacity: 0.5 }}>
          hourglass_empty
        </span>
        <span style={{ fontSize: 14 }}>Loading files...</span>
      </div>
    )
  }

  if (!files || files.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 24px 100px',
        textAlign: 'center',
      }}>
        {/* Geometric illustration — stacked folder shapes */}
        <div style={{ position: 'relative', width: 96, height: 80, marginBottom: 28 }}>
          {/* Back folder */}
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 4,
            right: 4,
            height: 56,
            borderRadius: '8px 8px 10px 10px',
            backgroundColor: 'var(--c--theme--colors--greyscale-200)',
            opacity: 0.5,
          }} />
          {/* Front folder */}
          <div style={{
            position: 'absolute',
            bottom: 6,
            left: 0,
            right: 0,
            height: 52,
            borderRadius: '8px 8px 10px 10px',
            backgroundColor: 'var(--c--theme--colors--greyscale-200)',
          }}>
            {/* Folder tab */}
            <div style={{
              position: 'absolute',
              top: -10,
              left: 8,
              width: 32,
              height: 14,
              borderRadius: '6px 6px 0 0',
              backgroundColor: 'var(--c--theme--colors--greyscale-200)',
            }} />
          </div>
          {/* Amber accent line */}
          <div style={{
            position: 'absolute',
            bottom: 20,
            left: 16,
            right: 16,
            height: 2,
            borderRadius: 1,
            backgroundColor: 'var(--c--theme--colors--primary-400)',
            opacity: 0.6,
          }} />
        </div>

        <h3 style={{
          fontSize: 16,
          fontWeight: 600,
          margin: '0 0 6px',
          color: 'var(--c--theme--colors--greyscale-700)',
        }}>
          {isTrash ? 'Trash is empty' : 'No files here yet'}
        </h3>
        <p style={{
          fontSize: 13,
          margin: 0,
          color: 'var(--c--theme--colors--greyscale-500)',
          maxWidth: 280,
          lineHeight: 1.5,
        }}>
          {isTrash
            ? 'Deleted files will appear here.'
            : 'Drop files anywhere to upload, or use the buttons above.'}
        </p>
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      {/* Column headers */}
      <div
        role="presentation"
        style={{
          display: 'grid',
          gridTemplateColumns: cols,
          padding: '0 4px',
          borderBottom: '1px solid var(--c--theme--colors--greyscale-200)',
          fontSize: 11,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.05em',
        }}
      >
        {['Name', 'Type', 'Size', 'Modified', 'Owner', ...(isTrash && onRestore ? [''] : [])].map((label) => (
          <div key={label || 'actions'} style={{
            padding: '10px 12px',
            fontWeight: 600,
            color: 'var(--c--theme--colors--greyscale-500)',
          }}>
            {label}
          </div>
        ))}
      </div>

      <GridList
        aria-label={isTrash ? 'Trash files' : 'File browser'}
        selectionMode="multiple"
        selectionBehavior="toggle"
        selectedKeys={ariaSelectedKeys}
        onSelectionChange={handleSelectionChange}
        onAction={handleAction}
        items={sorted}
        style={{ fontSize: 13 }}
        renderEmptyState={() => null}
      >
        {(file) => (
          <GridListItem
            key={file.id}
            id={file.id}
            textValue={file.filename}
            style={({ isSelected, isFocusVisible, isHovered }) => ({
              display: 'grid',
              gridTemplateColumns: cols,
              padding: '0 4px',
              borderBottom: '1px solid var(--c--theme--colors--greyscale-100)',
              backgroundColor: isSelected
                ? 'var(--c--theme--colors--primary-100)'
                : isHovered
                  ? 'var(--c--theme--colors--greyscale-100)'
                  : 'transparent',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
              outline: isFocusVisible ? '2px solid var(--c--theme--colors--primary-400)' : 'none',
              outlineOffset: -2,
              borderLeft: isSelected ? '2px solid var(--c--theme--colors--primary-400)' : '2px solid transparent',
            })}
          >
            <div
              style={{ display: 'contents' }}
              onContextMenu={(e: React.MouseEvent) => {
                e.preventDefault()
                setContextMenu({ file, x: e.clientX, y: e.clientY })
              }}
            >
              {/* Name */}
              <div style={{ padding: '12px 12px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span
                  className="material-icons" aria-hidden="true"
                  style={{
                    fontSize: 20,
                    flexShrink: 0,
                    color: file.is_folder
                      ? 'var(--c--theme--colors--primary-400)'
                      : 'var(--c--theme--colors--greyscale-500)',
                  }}
                >
                  {file.is_folder ? 'folder' : 'insert_drive_file'}
                </span>
                <span style={{
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: 'var(--c--theme--colors--greyscale-800)',
                }}>
                  {file.filename}
                </span>
              </div>

              {/* Type */}
              <div style={{ padding: '12px 12px', display: 'flex', alignItems: 'center' }}>
                {file.is_folder ? (
                  <span style={{ fontSize: 11, color: 'var(--c--theme--colors--greyscale-400)', fontStyle: 'italic' }}>Folder</span>
                ) : (
                  <AssetTypeBadge filename={file.filename} mimetype={file.mimetype} />
                )}
              </div>

              {/* Size */}
              <div style={{
                padding: '12px 12px',
                display: 'flex',
                alignItems: 'center',
                color: 'var(--c--theme--colors--greyscale-500)',
                fontFamily: 'var(--c--globals--font--families--mono, monospace)',
                fontSize: 12,
              }}>
                {file.is_folder
                  ? (Number(file.size) > 0 ? prettyBytes(Number(file.size)) : '\u2014')
                  : prettyBytes(Number(file.size) || 0)}
              </div>

              {/* Modified */}
              <div style={{
                padding: '12px 12px',
                display: 'flex',
                alignItems: 'center',
                color: 'var(--c--theme--colors--greyscale-500)',
                fontSize: 12,
              }}>
                {formatRelativeDate(file.updated_at)}
              </div>

              {/* Owner */}
              <div style={{
                padding: '12px 12px',
                display: 'flex',
                alignItems: 'center',
                color: 'var(--c--theme--colors--greyscale-400)',
                fontFamily: 'var(--c--globals--font--families--mono, monospace)',
                fontSize: 11,
              }}>
                {file.owner_id.slice(0, 8)}
              </div>

              {/* Restore */}
              {isTrash && onRestore && (
                <div style={{ padding: '12px 12px', display: 'flex', alignItems: 'center' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onRestore(file.id)
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--c--theme--colors--primary-500)',
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Restore
                  </button>
                </div>
              )}
            </div>
          </GridListItem>
        )}
      </GridList>

      {contextMenu && (
        <FileActions
          file={contextMenu.file}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          isTrash={isTrash}
        />
      )}
    </div>
  )
}
