import { describe, it, expect, beforeEach } from 'vitest'
import { useUploadStore } from '../upload'

const createMockFile = (name: string): File => {
  return new File(['content'], name, { type: 'application/octet-stream' })
}

describe('upload store', () => {
  beforeEach(() => {
    useUploadStore.setState({ uploads: new Map() })
  })

  it('starts with empty uploads', () => {
    expect(useUploadStore.getState().uploads.size).toBe(0)
  })

  it('addUpload creates a pending entry', () => {
    const file = createMockFile('test.txt')
    useUploadStore.getState().addUpload('upload-1', file)

    const entry = useUploadStore.getState().uploads.get('upload-1')
    expect(entry).toBeDefined()
    expect(entry!.status).toBe('pending')
    expect(entry!.progress).toBe(0)
    expect(entry!.file.name).toBe('test.txt')
  })

  it('updateProgress sets progress and status to uploading', () => {
    const file = createMockFile('test.txt')
    useUploadStore.getState().addUpload('upload-1', file)
    useUploadStore.getState().updateProgress('upload-1', 50)

    const entry = useUploadStore.getState().uploads.get('upload-1')
    expect(entry!.progress).toBe(50)
    expect(entry!.status).toBe('uploading')
  })

  it('markDone sets progress to 100 and status to done', () => {
    const file = createMockFile('test.txt')
    useUploadStore.getState().addUpload('upload-1', file)
    useUploadStore.getState().markDone('upload-1')

    const entry = useUploadStore.getState().uploads.get('upload-1')
    expect(entry!.progress).toBe(100)
    expect(entry!.status).toBe('done')
  })

  it('markError sets status and error message', () => {
    const file = createMockFile('test.txt')
    useUploadStore.getState().addUpload('upload-1', file)
    useUploadStore.getState().markError('upload-1', 'Network error')

    const entry = useUploadStore.getState().uploads.get('upload-1')
    expect(entry!.status).toBe('error')
    expect(entry!.error).toBe('Network error')
  })

  it('removeUpload deletes an entry', () => {
    const file = createMockFile('test.txt')
    useUploadStore.getState().addUpload('upload-1', file)
    useUploadStore.getState().removeUpload('upload-1')

    expect(useUploadStore.getState().uploads.has('upload-1')).toBe(false)
  })

  it('clearCompleted removes only done entries', () => {
    useUploadStore.getState().addUpload('u1', createMockFile('a.txt'))
    useUploadStore.getState().addUpload('u2', createMockFile('b.txt'))
    useUploadStore.getState().addUpload('u3', createMockFile('c.txt'))

    useUploadStore.getState().markDone('u1')
    useUploadStore.getState().markError('u2', 'fail')
    // u3 remains pending

    useUploadStore.getState().clearCompleted()

    const uploads = useUploadStore.getState().uploads
    expect(uploads.has('u1')).toBe(false) // done — removed
    expect(uploads.has('u2')).toBe(true)  // error — kept
    expect(uploads.has('u3')).toBe(true)  // pending — kept
  })

  it('handles multiple concurrent uploads', () => {
    for (let i = 0; i < 5; i++) {
      useUploadStore.getState().addUpload(`upload-${i}`, createMockFile(`file-${i}.txt`))
    }
    expect(useUploadStore.getState().uploads.size).toBe(5)
  })
})
