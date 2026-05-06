import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AssetTypeBadge from '../AssetTypeBadge'

describe('AssetTypeBadge', () => {
  it('renders document category for docx', () => {
    render(<AssetTypeBadge filename="report.docx" />)
    expect(screen.getByText('document')).toBeDefined()
  })

  it('renders image category for png', () => {
    render(<AssetTypeBadge filename="photo.png" />)
    // "image" appears both as icon text and category label
    expect(screen.getAllByText('image').length).toBeGreaterThanOrEqual(1)
  })

  it('renders video category for mp4', () => {
    render(<AssetTypeBadge filename="clip.mp4" />)
    expect(screen.getByText('video')).toBeDefined()
  })

  it('renders audio category for mp3', () => {
    render(<AssetTypeBadge filename="song.mp3" />)
    expect(screen.getByText('audio')).toBeDefined()
  })

  it('renders 3d-model category for fbx', () => {
    render(<AssetTypeBadge filename="character.fbx" />)
    expect(screen.getByText('3d-model')).toBeDefined()
  })

  it('renders texture category for dds', () => {
    render(<AssetTypeBadge filename="normal.dds" />)
    // "texture" appears both as icon text and category label
    expect(screen.getAllByText('texture').length).toBeGreaterThanOrEqual(1)
  })

  it('renders code category for json', () => {
    render(<AssetTypeBadge filename="config.json" />)
    // "code" appears both as icon text and category label
    expect(screen.getAllByText('code').length).toBeGreaterThanOrEqual(1)
  })

  it('renders archive category for zip', () => {
    render(<AssetTypeBadge filename="archive.zip" />)
    expect(screen.getByText('archive')).toBeDefined()
  })

  it('renders other category for unknown extension', () => {
    render(<AssetTypeBadge filename="mystery.xyz" />)
    expect(screen.getByText('other')).toBeDefined()
  })

  it('uses mimetype when extension is unknown', () => {
    render(<AssetTypeBadge filename="noext" mimetype="image/png" />)
    expect(screen.getAllByText('image').length).toBeGreaterThanOrEqual(1)
  })
})
