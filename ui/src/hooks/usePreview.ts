import { getAssetType } from './useAssetType'

export type PreviewType = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'none'

const previewableExtensions: Record<string, PreviewType> = {
  // Images
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',

  // Video
  mp4: 'video',
  webm: 'video',

  // Audio
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  aac: 'audio',

  // PDF
  pdf: 'pdf',

  // Text / code
  txt: 'text',
  csv: 'text',
  json: 'text',
  yaml: 'text',
  yml: 'text',
  xml: 'text',
  lua: 'text',
  py: 'text',
  js: 'text',
  ts: 'text',
  glsl: 'text',
  hlsl: 'text',
  md: 'text',
  html: 'text',
  css: 'text',
}

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  if (dot === -1) return ''
  return filename.slice(dot + 1).toLowerCase()
}

export interface PreviewInfo {
  canPreview: boolean
  previewType: PreviewType
}

export function getPreviewInfo(filename: string): PreviewInfo {
  const ext = getExtension(filename)
  const previewType = previewableExtensions[ext]
  if (previewType) {
    return { canPreview: true, previewType }
  }

  // Fall back to asset type detection
  const assetType = getAssetType(filename)
  if (assetType.canPreview) {
    if (assetType.category === 'image') return { canPreview: true, previewType: 'image' }
    if (assetType.category === 'video') return { canPreview: true, previewType: 'video' }
    if (assetType.category === 'audio') return { canPreview: true, previewType: 'audio' }
    if (assetType.category === 'document') return { canPreview: true, previewType: 'pdf' }
    if (assetType.category === 'code') return { canPreview: true, previewType: 'text' }
  }

  return { canPreview: false, previewType: 'none' }
}

export function usePreview(filename: string | undefined): PreviewInfo {
  if (!filename) return { canPreview: false, previewType: 'none' }
  return getPreviewInfo(filename)
}
