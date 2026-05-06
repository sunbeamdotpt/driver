import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { DropZone, FileTrigger } from 'react-aria-components'
import { useUploadFile } from '../api/files'
import { useUploadStore } from '../stores/upload'

interface FileUploadProps {
  parentId?: string
  children: React.ReactNode
}

let uploadCounter = 0

export default function FileUpload({ parentId, children }: FileUploadProps) {
  const uploadFile = useUploadFile()
  const { uploads, addUpload, updateProgress, markDone, markError } = useUploadStore()
  const [dropMessage, setDropMessage] = useState<string | null>(null)

  const processFiles = useCallback(
    (files: File[]) => {
      setDropMessage(`${files.length} file${files.length !== 1 ? 's' : ''} added to upload queue`)

      for (const file of files) {
        const uploadId = `upload-${++uploadCounter}-${file.name}`
        addUpload(uploadId, file)

        uploadFile.mutateAsync({ file, parentId })
          .then(() => {
            markDone(uploadId)
          })
          .catch((err: Error) => {
            markError(uploadId, err.message)
          })

        let progress = 0
        const interval = setInterval(() => {
          progress += 10
          if (progress >= 90) clearInterval(interval)
          updateProgress(uploadId, progress)
        }, 200)
      }
    },
    [parentId, uploadFile, addUpload, updateProgress, markDone, markError],
  )

  const onDrop = useCallback(
    (acceptedFiles: File[]) => processFiles(acceptedFiles),
    [processFiles],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
  })

  const activeUploads = Array.from(uploads.entries()).filter(
    ([, entry]) => entry.status !== 'done',
  )

  return (
    <DropZone
      aria-label="Drop files to upload"
      onDrop={async (e) => {
        const files: File[] = []
        for (const item of e.items) {
          if (item.kind === 'file') {
            const file = await item.getFile()
            files.push(file)
          }
        }
        if (files.length > 0) processFiles(files)
      }}
      style={{ position: 'relative', minHeight: '100%' }}
    >
      <div {...getRootProps()} style={{ minHeight: '100%' }}>
        <input {...getInputProps()} />

        {/* Drag overlay */}
        {isDragActive && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 100,
              backdropFilter: 'blur(4px)',
              backgroundColor: 'var(--c--theme--colors--primary-050)',
              border: '2px dashed var(--c--theme--colors--primary-400)',
              borderRadius: 12,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              pointerEvents: 'none',
            }}
          >
            <span className="material-icons" aria-hidden="true" style={{
              fontSize: 40,
              color: 'var(--c--theme--colors--primary-400)',
            }}>
              cloud_upload
            </span>
            <span style={{
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--c--theme--colors--primary-400)',
            }}>
              Drop files to upload
            </span>
            <span style={{
              fontSize: 12,
              color: 'var(--c--theme--colors--greyscale-500)',
            }}>
              Files will be uploaded to this folder
            </span>
          </div>
        )}

        {children}
      </div>

      {/* SR announcement */}
      <div aria-live="assertive" role="status" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
        {dropMessage}
      </div>

      <FileTrigger
        onSelect={(fileList) => {
          if (fileList) processFiles(Array.from(fileList))
        }}
      >
        {/* Invisible accessible file picker trigger */}
      </FileTrigger>

      {/* Upload progress panel — frosted card */}
      {activeUploads.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            width: 300,
            backgroundColor: 'var(--c--theme--colors--greyscale-000)',
            border: '1px solid var(--c--theme--colors--greyscale-200)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 1px 4px rgba(0,0,0,0.08)',
            padding: '14px 16px',
            zIndex: 1000,
            backdropFilter: 'blur(12px)',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
            paddingBottom: 10,
            borderBottom: '1px solid var(--c--theme--colors--greyscale-200)',
          }}>
            <span className="material-icons" aria-hidden="true" style={{
              fontSize: 18,
              color: 'var(--c--theme--colors--primary-400)',
            }}>
              upload
            </span>
            <span style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--c--theme--colors--greyscale-700)',
              flex: 1,
            }}>
              Uploading {activeUploads.length} file{activeUploads.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* File list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activeUploads.map(([id, entry]) => (
              <div key={id}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: 5,
                }}>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: entry.status === 'error'
                      ? 'var(--c--theme--colors--danger-400)'
                      : 'var(--c--theme--colors--greyscale-700)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    marginRight: 8,
                  }}>
                    {entry.file.name}
                  </span>
                  <span style={{
                    fontSize: 11,
                    color: 'var(--c--theme--colors--greyscale-500)',
                    fontFamily: 'var(--c--globals--font--families--mono, monospace)',
                    flexShrink: 0,
                  }}>
                    {entry.status === 'error' ? 'Failed' : `${entry.progress}%`}
                  </span>
                </div>
                <div style={{
                  height: 3,
                  backgroundColor: 'var(--c--theme--colors--greyscale-200)',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${entry.progress}%`,
                    backgroundColor: entry.status === 'error'
                      ? 'var(--c--theme--colors--danger-400)'
                      : 'var(--c--theme--colors--primary-400)',
                    transition: 'width 0.3s ease',
                    borderRadius: 2,
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </DropZone>
  )
}
