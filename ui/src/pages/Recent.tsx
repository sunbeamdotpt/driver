import { useRecentFiles } from '../api/files'
import FileBrowser from '../components/FileBrowser'

export default function Recent() {
  const { data: files, isLoading } = useRecentFiles()

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
        Recent Files
      </h2>
      <FileBrowser files={files ?? []} isLoading={isLoading} />
    </div>
  )
}
