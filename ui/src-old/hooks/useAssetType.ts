export type AssetCategory =
  | 'document'
  | 'image'
  | 'video'
  | 'audio'
  | '3d-model'
  | 'texture'
  | 'code'
  | 'archive'
  | 'other'

export interface AssetTypeInfo {
  category: AssetCategory
  icon: string
  canPreview: boolean
  canEdit: boolean
  color: string
}

const EXT_MAP: Record<string, AssetTypeInfo> = {
  // Office documents — editable in Collabora
  docx: { category: 'document', icon: 'description', canPreview: false, canEdit: true, color: '#2b579a' },
  doc: { category: 'document', icon: 'description', canPreview: false, canEdit: true, color: '#2b579a' },
  xlsx: { category: 'document', icon: 'table_chart', canPreview: false, canEdit: true, color: '#217346' },
  xls: { category: 'document', icon: 'table_chart', canPreview: false, canEdit: true, color: '#217346' },
  pptx: { category: 'document', icon: 'slideshow', canPreview: false, canEdit: true, color: '#d24726' },
  ppt: { category: 'document', icon: 'slideshow', canPreview: false, canEdit: true, color: '#d24726' },
  odt: { category: 'document', icon: 'description', canPreview: false, canEdit: true, color: '#2b579a' },
  ods: { category: 'document', icon: 'table_chart', canPreview: false, canEdit: true, color: '#217346' },
  odp: { category: 'document', icon: 'slideshow', canPreview: false, canEdit: true, color: '#d24726' },
  pdf: { category: 'document', icon: 'picture_as_pdf', canPreview: true, canEdit: false, color: '#c0392b' },
  txt: { category: 'document', icon: 'article', canPreview: true, canEdit: true, color: '#7f8c8d' },
  csv: { category: 'document', icon: 'table_chart', canPreview: true, canEdit: true, color: '#217346' },

  // Images
  png: { category: 'image', icon: 'image', canPreview: true, canEdit: false, color: '#8e44ad' },
  jpg: { category: 'image', icon: 'image', canPreview: true, canEdit: false, color: '#8e44ad' },
  jpeg: { category: 'image', icon: 'image', canPreview: true, canEdit: false, color: '#8e44ad' },
  gif: { category: 'image', icon: 'gif', canPreview: true, canEdit: false, color: '#8e44ad' },
  webp: { category: 'image', icon: 'image', canPreview: true, canEdit: false, color: '#8e44ad' },
  svg: { category: 'image', icon: 'image', canPreview: true, canEdit: false, color: '#8e44ad' },
  tga: { category: 'image', icon: 'image', canPreview: false, canEdit: false, color: '#8e44ad' },
  psd: { category: 'image', icon: 'image', canPreview: false, canEdit: false, color: '#8e44ad' },
  exr: { category: 'image', icon: 'image', canPreview: false, canEdit: false, color: '#8e44ad' },

  // Video
  mp4: { category: 'video', icon: 'movie', canPreview: true, canEdit: false, color: '#e74c3c' },
  webm: { category: 'video', icon: 'movie', canPreview: true, canEdit: false, color: '#e74c3c' },
  mov: { category: 'video', icon: 'movie', canPreview: false, canEdit: false, color: '#e74c3c' },
  avi: { category: 'video', icon: 'movie', canPreview: false, canEdit: false, color: '#e74c3c' },
  mkv: { category: 'video', icon: 'movie', canPreview: false, canEdit: false, color: '#e74c3c' },

  // Audio
  mp3: { category: 'audio', icon: 'audiotrack', canPreview: true, canEdit: false, color: '#f39c12' },
  wav: { category: 'audio', icon: 'audiotrack', canPreview: true, canEdit: false, color: '#f39c12' },
  ogg: { category: 'audio', icon: 'audiotrack', canPreview: true, canEdit: false, color: '#f39c12' },
  flac: { category: 'audio', icon: 'audiotrack', canPreview: false, canEdit: false, color: '#f39c12' },
  aac: { category: 'audio', icon: 'audiotrack', canPreview: true, canEdit: false, color: '#f39c12' },

  // 3D Models
  fbx: { category: '3d-model', icon: 'view_in_ar', canPreview: false, canEdit: false, color: '#1abc9c' },
  gltf: { category: '3d-model', icon: 'view_in_ar', canPreview: false, canEdit: false, color: '#1abc9c' },
  glb: { category: '3d-model', icon: 'view_in_ar', canPreview: false, canEdit: false, color: '#1abc9c' },
  obj: { category: '3d-model', icon: 'view_in_ar', canPreview: false, canEdit: false, color: '#1abc9c' },
  blend: { category: '3d-model', icon: 'view_in_ar', canPreview: false, canEdit: false, color: '#1abc9c' },

  // Textures (game-specific)
  dds: { category: 'texture', icon: 'texture', canPreview: false, canEdit: false, color: '#9b59b6' },
  ktx: { category: 'texture', icon: 'texture', canPreview: false, canEdit: false, color: '#9b59b6' },
  ktx2: { category: 'texture', icon: 'texture', canPreview: false, canEdit: false, color: '#9b59b6' },
  basis: { category: 'texture', icon: 'texture', canPreview: false, canEdit: false, color: '#9b59b6' },

  // Code
  json: { category: 'code', icon: 'code', canPreview: true, canEdit: false, color: '#3498db' },
  yaml: { category: 'code', icon: 'code', canPreview: true, canEdit: false, color: '#3498db' },
  yml: { category: 'code', icon: 'code', canPreview: true, canEdit: false, color: '#3498db' },
  xml: { category: 'code', icon: 'code', canPreview: true, canEdit: false, color: '#3498db' },
  lua: { category: 'code', icon: 'code', canPreview: true, canEdit: false, color: '#3498db' },
  py: { category: 'code', icon: 'code', canPreview: true, canEdit: false, color: '#3498db' },
  js: { category: 'code', icon: 'code', canPreview: true, canEdit: false, color: '#3498db' },
  ts: { category: 'code', icon: 'code', canPreview: true, canEdit: false, color: '#3498db' },
  glsl: { category: 'code', icon: 'code', canPreview: true, canEdit: false, color: '#3498db' },
  hlsl: { category: 'code', icon: 'code', canPreview: true, canEdit: false, color: '#3498db' },

  // Archives
  zip: { category: 'archive', icon: 'folder_zip', canPreview: false, canEdit: false, color: '#95a5a6' },
  tar: { category: 'archive', icon: 'folder_zip', canPreview: false, canEdit: false, color: '#95a5a6' },
  gz: { category: 'archive', icon: 'folder_zip', canPreview: false, canEdit: false, color: '#95a5a6' },
  '7z': { category: 'archive', icon: 'folder_zip', canPreview: false, canEdit: false, color: '#95a5a6' },
}

const MIME_CATEGORY_MAP: Record<string, AssetTypeInfo> = {
  'image/': { category: 'image', icon: 'image', canPreview: true, canEdit: false, color: '#8e44ad' },
  'video/': { category: 'video', icon: 'movie', canPreview: true, canEdit: false, color: '#e74c3c' },
  'audio/': { category: 'audio', icon: 'audiotrack', canPreview: true, canEdit: false, color: '#f39c12' },
  'text/': { category: 'code', icon: 'code', canPreview: true, canEdit: false, color: '#3498db' },
}

const DEFAULT_ASSET: AssetTypeInfo = {
  category: 'other',
  icon: 'insert_drive_file',
  canPreview: false,
  canEdit: false,
  color: '#7f8c8d',
}

function getExtension(filename: string): string {
  const parts = filename.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
}

export function getAssetType(filename: string, mimetype?: string): AssetTypeInfo {
  // Try extension first
  const ext = getExtension(filename)
  if (ext && EXT_MAP[ext]) {
    return EXT_MAP[ext]
  }

  // Try direct key lookup (if passed just an extension)
  const lower = filename.toLowerCase()
  if (EXT_MAP[lower]) {
    return EXT_MAP[lower]
  }

  // Try mimetype prefix matching
  if (mimetype) {
    if (mimetype === 'application/pdf') return EXT_MAP['pdf']
    if (mimetype === 'application/json') return EXT_MAP['json']
    if (mimetype === 'application/xml') return EXT_MAP['xml']
    if (mimetype === 'application/javascript') return EXT_MAP['js']

    for (const [prefix, asset] of Object.entries(MIME_CATEGORY_MAP)) {
      if (mimetype.startsWith(prefix)) {
        return asset
      }
    }
  }

  return DEFAULT_ASSET
}

export function useAssetType(filename: string | undefined, mimetype?: string): AssetTypeInfo {
  if (!filename) return DEFAULT_ASSET
  return getAssetType(filename, mimetype)
}
