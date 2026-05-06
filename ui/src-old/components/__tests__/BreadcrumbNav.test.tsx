import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BreadcrumbNav from '../BreadcrumbNav'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock the useFile hook from api/files
vi.mock('../../api/files', () => ({
  useFile: vi.fn((id?: string) => {
    if (!id) return { data: undefined }
    if (id === 'folder-1') {
      return {
        data: {
          id: 'folder-1',
          filename: 'Documents',
          parent_id: null,
        },
      }
    }
    if (id === 'folder-child') {
      return {
        data: {
          id: 'folder-child',
          filename: 'Subdir',
          parent_id: 'folder-1',
        },
      }
    }
    return { data: undefined }
  }),
}))

describe('BreadcrumbNav', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders breadcrumb nav with aria label', () => {
    render(
      <MemoryRouter>
        <BreadcrumbNav />
      </MemoryRouter>
    )
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeDefined()
  })

  it('renders My Files as root breadcrumb', () => {
    render(
      <MemoryRouter>
        <BreadcrumbNav />
      </MemoryRouter>
    )
    expect(screen.getByText('My Files')).toBeDefined()
  })

  it('renders folder name when folderId is provided', () => {
    render(
      <MemoryRouter>
        <BreadcrumbNav folderId="folder-1" />
      </MemoryRouter>
    )
    expect(screen.getByText('My Files')).toBeDefined()
    expect(screen.getByText('Documents')).toBeDefined()
  })

  it('renders ellipsis for parent folder when nested', () => {
    render(
      <MemoryRouter>
        <BreadcrumbNav folderId="folder-child" />
      </MemoryRouter>
    )
    expect(screen.getByText('...')).toBeDefined()
    expect(screen.getByText('Subdir')).toBeDefined()
  })

  it('navigates to /explorer when My Files clicked (root, not last)', () => {
    render(
      <MemoryRouter>
        <BreadcrumbNav folderId="folder-1" />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByText('My Files'))
    expect(mockNavigate).toHaveBeenCalledWith('/explorer')
  })

  it('navigates to parent folder when ellipsis clicked', () => {
    render(
      <MemoryRouter>
        <BreadcrumbNav folderId="folder-child" />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByText('...'))
    expect(mockNavigate).toHaveBeenCalledWith('/explorer/folder-1')
  })

  it('renders chevron separators between breadcrumbs', () => {
    render(
      <MemoryRouter>
        <BreadcrumbNav folderId="folder-1" />
      </MemoryRouter>
    )
    expect(screen.getByText('chevron_right')).toBeDefined()
  })
})
