import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@gouvfr-lasuite/cunningham-react'
import { useFiles, useCreateFolder } from '../api/files'
import BreadcrumbNav from '../components/BreadcrumbNav'
import FileBrowser from '../components/FileBrowser'
import FileUpload from '../components/FileUpload'

export default function Explorer() {
  const { folderId } = useParams<{ folderId?: string }>()
  const { data: files, isLoading } = useFiles(folderId)
  const createFolder = useCreateFolder()
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return
    createFolder.mutate({
      name: newFolderName.trim(),
      parent_id: folderId || null,
    })
    setNewFolderName('')
    setShowNewFolder(false)
  }

  return (
    <FileUpload parentId={folderId}>
      <div>
        {/* Toolbar: breadcrumbs left, actions right */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}>
          <BreadcrumbNav folderId={folderId} />
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Button
              color="neutral"
              variant="tertiary"
              size="small"
              icon={<span className="material-icons" aria-hidden="true" style={{ fontSize: 18 }}>create_new_folder</span>}
              onClick={() => setShowNewFolder(true)}
            >
              New Folder
            </Button>
            <Button
              color="brand"
              size="small"
              icon={<span className="material-icons" aria-hidden="true" style={{ fontSize: 18 }}>upload_file</span>}
              onClick={() => {
                const input = document.createElement('input')
                input.type = 'file'
                input.multiple = true
                input.onchange = (e) => {
                  const target = e.target as HTMLInputElement
                  if (target.files) {
                    const dropEvent = new Event('drop')
                    Object.defineProperty(dropEvent, 'dataTransfer', {
                      value: { files: target.files },
                    })
                  }
                }
                input.click()
              }}
            >
              Upload
            </Button>
          </div>
        </div>

        {/* New folder inline form */}
        {showNewFolder && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              marginBottom: 16,
              padding: '10px 14px',
              backgroundColor: 'var(--c--theme--colors--greyscale-000)',
              borderRadius: 8,
              border: '1px solid var(--c--theme--colors--greyscale-200)',
            }}
          >
            <span className="material-icons" aria-hidden="true" style={{ fontSize: 20, color: 'var(--c--theme--colors--primary-400)' }}>
              create_new_folder
            </span>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder()
                if (e.key === 'Escape') setShowNewFolder(false)
              }}
              placeholder="Folder name"
              autoFocus
              style={{
                flex: 1,
                padding: '6px 10px',
                border: '1px solid var(--c--theme--colors--greyscale-300)',
                borderRadius: 6,
                fontSize: 13,
                backgroundColor: 'var(--c--theme--colors--greyscale-50)',
                color: 'var(--c--theme--colors--greyscale-800)',
                outline: 'none',
              }}
            />
            <Button color="brand" size="small" onClick={handleCreateFolder}>
              Create
            </Button>
            <Button color="neutral" variant="tertiary" size="small" onClick={() => setShowNewFolder(false)}>
              Cancel
            </Button>
          </div>
        )}

        {/* File browser */}
        <div style={{
          backgroundColor: 'var(--c--theme--colors--greyscale-000)',
          borderRadius: 10,
          border: '1px solid var(--c--theme--colors--greyscale-200)',
          overflow: 'hidden',
        }}>
          <FileBrowser files={files ?? []} isLoading={isLoading} />
        </div>
      </div>
    </FileUpload>
  )
}
