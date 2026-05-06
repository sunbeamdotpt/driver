import type { ComponentType } from 'react'

export interface ThreeDPreviewConfig {
  // Will be implemented when we add three.js / model-viewer
  rendererType: 'three' | 'model-viewer' | 'none'
  supportedFormats: string[]
}

export function useThreeDPreview(_fileId: string): {
  isSupported: boolean
  PreviewComponent: ComponentType | null
} {
  // Stub -- always returns not supported for now
  return { isSupported: false, PreviewComponent: null }
}
