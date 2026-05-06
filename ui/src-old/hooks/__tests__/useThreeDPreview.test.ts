import { describe, it, expect } from 'vitest'
import { useThreeDPreview } from '../useThreeDPreview'

describe('useThreeDPreview', () => {
  it('returns isSupported false', () => {
    const result = useThreeDPreview('file-123')
    expect(result.isSupported).toBe(false)
  })

  it('returns null PreviewComponent', () => {
    const result = useThreeDPreview('file-123')
    expect(result.PreviewComponent).toBeNull()
  })

  it('works with any file id', () => {
    const result = useThreeDPreview('any-id')
    expect(result).toEqual({ isSupported: false, PreviewComponent: null })
  })
})
