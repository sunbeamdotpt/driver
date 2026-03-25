import { Button, Menu, MenuItem, MenuTrigger, Popover, Separator, Section, Header } from 'react-aria-components'
import type { SessionUser } from '../api/session'

interface ProfileMenuProps {
  user: SessionUser
}

function getInitials(name: string, email: string): string {
  if (name && name !== email) {
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return parts[0]?.[0]?.toUpperCase() ?? '?'
  }
  return email?.[0]?.toUpperCase() ?? '?'
}

function Avatar({ user, size = 36 }: { user: SessionUser; size?: number }) {
  const initials = getInitials(user.name, user.email)
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        overflow: 'hidden',
        backgroundColor: 'var(--c--theme--colors--primary-400)',
        color: 'var(--c--theme--colors--greyscale-000)',
        fontSize: size * 0.38,
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      {user.picture ? (
        <img
          src={user.picture}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        initials
      )}
    </div>
  )
}

export default function ProfileMenu({ user }: ProfileMenuProps) {
  const handleLogout = () => {
    window.location.href = `${window.location.origin}/api/auth/logout`
  }

  return (
    <MenuTrigger>
      <Button
        aria-label="Profile menu"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          borderRadius: '50%',
          transition: 'box-shadow 0.15s',
        }}
      >
        <Avatar user={user} size={36} />
      </Button>

      <Popover
        placement="bottom end"
        style={{
          backgroundColor: 'var(--c--theme--colors--greyscale-000)',
          borderRadius: 8,
          boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
          minWidth: 220,
          outline: 'none',
        }}
      >
        <Menu
          onAction={(key) => {
            if (key === 'logout') handleLogout()
          }}
          style={{ outline: 'none' }}
        >
          <Section>
            <Header
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '16px 16px 14px',
              }}
            >
              <Avatar user={user} size={40} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 14,
                    color: 'var(--c--theme--colors--greyscale-800)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {user.name || user.email}
                </div>
                {user.name && user.name !== user.email && (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--c--theme--colors--greyscale-500)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      marginTop: 2,
                    }}
                  >
                    {user.email}
                  </div>
                )}
              </div>
            </Header>
          </Section>

          <Separator
            style={{
              margin: 0,
              border: 'none',
              borderTop: '1px solid var(--c--theme--colors--greyscale-200)',
            }}
          />

          <Section>
            <MenuItem
              id="logout"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '10px 16px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontSize: 14,
                color: 'var(--c--theme--colors--greyscale-700)',
                textAlign: 'left',
                outline: 'none',
              }}
            >
              <span className="material-icons" aria-hidden="true" style={{ fontSize: 20 }}>
                logout
              </span>
              Logout
            </MenuItem>
          </Section>

          <Separator
            style={{
              margin: 0,
              border: 'none',
              borderTop: '1px solid var(--c--theme--colors--greyscale-200)',
            }}
          />

          <Section>
            <Header
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                fontSize: 12,
                color: 'var(--c--theme--colors--greyscale-500)',
              }}
            >
              <span>EN</span>
              <a
                href="/terms"
                style={{
                  color: 'inherit',
                  textDecoration: 'none',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
              >
                Terms of service
              </a>
            </Header>
          </Section>
        </Menu>
      </Popover>
    </MenuTrigger>
  )
}
