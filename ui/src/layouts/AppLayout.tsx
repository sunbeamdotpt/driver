import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Button } from '@gouvfr-lasuite/cunningham-react'
import { ListBox, ListBoxItem } from 'react-aria-components'
import WaffleButton from '../components/WaffleButton'
import ProfileMenu from '../components/ProfileMenu'
import { useSession } from '../api/session'

const navItems = [
  { to: '/explorer', label: 'My Files', icon: 'folder' },
  { to: '/recent', label: 'Recent', icon: 'schedule' },
  { to: '/favorites', label: 'Favorites', icon: 'star' },
  { to: '/trash', label: 'Trash', icon: 'delete' },
]

export default function AppLayout() {
  const { data: session } = useSession()
  const user = session?.user
  const navigate = useNavigate()
  const location = useLocation()

  const selectedKeys = navItems
    .filter((item) => location.pathname.startsWith(item.to))
    .map((item) => item.to)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          height: 56,
          borderBottom: '1px solid var(--c--theme--colors--greyscale-200)',
          backgroundColor: 'var(--c--theme--colors--greyscale-000)',
          flexShrink: 0,
        }}
      >
        <h1
          style={{
            fontSize: 17,
            fontWeight: 700,
            margin: 0,
            color: 'var(--c--theme--colors--greyscale-800)',
            letterSpacing: '-0.01em',
          }}
        >
          Drive
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <WaffleButton />
          {user && <ProfileMenu user={user} />}
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <nav
          style={{
            width: 220,
            padding: '20px 12px',
            borderRight: '1px solid var(--c--theme--colors--greyscale-200)',
            backgroundColor: 'var(--c--theme--colors--greyscale-000)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            flexShrink: 0,
            overflowY: 'auto',
          }}
        >
          <ListBox
            aria-label="Navigation"
            selectionMode="single"
            selectedKeys={selectedKeys}
            onAction={(key) => navigate(String(key))}
            style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
          >
            {navItems.map((item) => (
              <ListBoxItem
                key={item.to}
                id={item.to}
                textValue={item.label}
                style={{ outline: 'none' }}
              >
                {({ isSelected }) => (
                  <NavLink
                    to={item.to}
                    style={() => ({ textDecoration: 'none', display: 'block' })}
                    tabIndex={-1}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 12px',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: isSelected ? 600 : 450,
                        color: isSelected
                          ? 'var(--c--theme--colors--primary-400)'
                          : 'var(--c--theme--colors--greyscale-600)',
                        backgroundColor: isSelected
                          ? 'var(--c--theme--colors--primary-050)'
                          : 'transparent',
                        borderLeft: isSelected
                          ? '3px solid var(--c--theme--colors--primary-400)'
                          : '3px solid transparent',
                        transition: 'all 0.15s ease',
                        cursor: 'pointer',
                      }}
                    >
                      <span className="material-icons" aria-hidden="true" style={{
                        fontSize: 19,
                        opacity: isSelected ? 1 : 0.7,
                      }}>
                        {item.icon}
                      </span>
                      {item.label}
                    </div>
                  </NavLink>
                )}
              </ListBoxItem>
            ))}
          </ListBox>
        </nav>

        {/* Main content */}
        <main
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '20px 28px',
            backgroundColor: 'var(--c--theme--colors--greyscale-50)',
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
