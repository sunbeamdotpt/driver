import { describe, it, expect } from 'vitest'
import { getAssetType } from '../useAssetType'

describe('getAssetType', () => {
  it('returns document for docx', () => {
    expect(getAssetType('report.docx')).toMatchObject({ category: 'document', canEdit: true })
  })

  it('returns document for xlsx', () => {
    expect(getAssetType('data.xlsx')).toMatchObject({ category: 'document', canEdit: true })
  })

  it('returns document for pdf', () => {
    expect(getAssetType('manual.pdf')).toMatchObject({ category: 'document', canPreview: true, canEdit: false })
  })

  it('returns image for png', () => {
    expect(getAssetType('photo.png')).toMatchObject({ category: 'image', canPreview: true })
  })

  it('returns image for svg', () => {
    expect(getAssetType('icon.svg')).toMatchObject({ category: 'image', canPreview: true })
  })

  it('returns video for mp4', () => {
    expect(getAssetType('clip.mp4')).toMatchObject({ category: 'video', canPreview: true })
  })

  it('returns video for mkv (not previewable)', () => {
    expect(getAssetType('movie.mkv')).toMatchObject({ category: 'video', canPreview: false })
  })

  it('returns audio for mp3', () => {
    expect(getAssetType('song.mp3')).toMatchObject({ category: 'audio', canPreview: true })
  })

  it('returns audio for flac (not previewable)', () => {
    expect(getAssetType('track.flac')).toMatchObject({ category: 'audio', canPreview: false })
  })

  it('returns 3d-model for fbx', () => {
    expect(getAssetType('character.fbx')).toMatchObject({ category: '3d-model' })
  })

  it('returns 3d-model for glb', () => {
    expect(getAssetType('model.glb')).toMatchObject({ category: '3d-model' })
  })

  it('returns texture for dds', () => {
    expect(getAssetType('normal.dds')).toMatchObject({ category: 'texture' })
  })

  it('returns texture for ktx2', () => {
    expect(getAssetType('compressed.ktx2')).toMatchObject({ category: 'texture' })
  })

  it('returns code for json', () => {
    expect(getAssetType('config.json')).toMatchObject({ category: 'code', canPreview: true })
  })

  it('returns code for glsl', () => {
    expect(getAssetType('shader.glsl')).toMatchObject({ category: 'code', canPreview: true })
  })

  it('returns archive for zip', () => {
    expect(getAssetType('bundle.zip')).toMatchObject({ category: 'archive' })
  })

  it('returns archive for 7z', () => {
    expect(getAssetType('backup.7z')).toMatchObject({ category: 'archive' })
  })

  it('returns other for unknown extension', () => {
    expect(getAssetType('unknown.xyz')).toMatchObject({ category: 'other' })
  })

  it('falls back to mimetype for image/', () => {
    expect(getAssetType('noext', 'image/webp')).toMatchObject({ category: 'image' })
  })

  it('falls back to mimetype for application/pdf', () => {
    expect(getAssetType('noext', 'application/pdf')).toMatchObject({ category: 'document' })
  })

  it('handles uppercase extensions', () => {
    expect(getAssetType('PHOTO.PNG')).toMatchObject({ category: 'image' })
  })

  it('handles files with multiple dots', () => {
    expect(getAssetType('my.file.name.docx')).toMatchObject({ category: 'document' })
  })
})
