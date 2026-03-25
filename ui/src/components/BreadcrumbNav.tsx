import { useNavigate } from 'react-router-dom'
import { useFile } from '../api/files'

interface BreadcrumbNavProps {
  folderId?: string
}

interface BreadcrumbSegment {
  id: string | null
  name: string
}

function useBreadcrumbs(folderId?: string): BreadcrumbSegment[] {
  const { data: folder } = useFile(folderId)

  const crumbs: BreadcrumbSegment[] = [{ id: null, name: 'My Files' }]

  if (folder) {
    if (folder.parent_id) {
      crumbs.push({ id: folder.parent_id, name: '...' })
    }
    crumbs.push({ id: folder.id, name: folder.filename })
  }

  return crumbs
}

export default function BreadcrumbNav({ folderId }: BreadcrumbNavProps) {
  const navigate = useNavigate()
  const breadcrumbs = useBreadcrumbs(folderId)

  return (
    <nav
      aria-label="Breadcrumb"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        fontSize: 14,
      }}
    >
      {breadcrumbs.map((crumb, index) => {
        const isLast = index === breadcrumbs.length - 1
        return (
          <span key={crumb.id ?? 'root'} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {index > 0 && (
              <span className="material-icons" aria-hidden="true" style={{
                fontSize: 16,
                color: 'var(--c--theme--colors--greyscale-400)',
                userSelect: 'none',
              }}>
                chevron_right
              </span>
            )}
            {isLast ? (
              <span style={{
                fontWeight: 600,
                color: 'var(--c--theme--colors--greyscale-800)',
                padding: '4px 6px',
              }}>
                {crumb.name}
              </span>
            ) : (
              <button
                onClick={() => {
                  if (crumb.id === null) {
                    navigate('/explorer')
                  } else {
                    navigate(`/explorer/${crumb.id}`)
                  }
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 6px',
                  borderRadius: 4,
                  color: 'var(--c--theme--colors--greyscale-500)',
                  fontWeight: 500,
                  fontSize: 14,
                  transition: 'color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--c--theme--colors--primary-400)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--c--theme--colors--greyscale-500)'
                }}
              >
                {crumb.name}
              </button>
            )}
          </span>
        )
      })}
    </nav>
  )
}
