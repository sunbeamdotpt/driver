import { useTrashFiles, useRestoreFile } from '../api/files'
import FileBrowser from '../components/FileBrowser'

export default function Trash() {
  const { data: files, isLoading } = useTrashFiles()
  const restoreFile = useRestoreFile()

  const handleRestore = (id: string) => {
    restoreFile.mutate(id)
  }

  return (
    <div>
      <h2
        style={{
          fontSize: 20,
          fontWeight: 700,
          marginBottom: 16,
          color: 'var(--c--theme--colors--greyscale-800)',
        }}
      >
        Trash
      </h2>
      <p style={{ fontSize: 13, color: 'var(--c--theme--colors--greyscale-500)', marginBottom: 16 }}>
        Files in trash will be permanently deleted after 30 days.
      </p>
      <FileBrowser
        files={files ?? []}
        isLoading={isLoading}
        isTrash
        onRestore={handleRestore}
      />
    </div>
  )
}
