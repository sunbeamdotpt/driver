import { useFavoriteFiles } from '../api/files'
import FileBrowser from '../components/FileBrowser'

export default function Favorites() {
  const { data: files, isLoading } = useFavoriteFiles()

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
        Favorites
      </h2>
      <FileBrowser files={files ?? []} isLoading={isLoading} />
    </div>
  )
}
