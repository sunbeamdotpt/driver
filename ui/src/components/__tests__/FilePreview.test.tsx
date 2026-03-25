import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import FilePreview from '../FilePreview'

describe('FilePreview', () => {
  const baseProps = {
    fileId: 'file-123',
    downloadUrl: 'https://example.com/download/file-123',
    onClose: vi.fn(),
  }

  it('renders an img element for image/* mimetypes', () => {
    render(<FilePreview {...baseProps} filename="photo.jpg" mimetype="image/jpeg" />)

    const img = screen.getByTestId('image-preview')
    expect(img).toBeDefined()
    expect(img.tagName).toBe('IMG')
    expect(img.getAttribute('src')).toBe(baseProps.downloadUrl)
    expect(img.getAttribute('alt')).toBe('photo.jpg')
  })

  it('renders a video element for video/* mimetypes', () => {
    render(<FilePreview {...baseProps} filename="clip.mp4" mimetype="video/mp4" />)

    const video = screen.getByTestId('video-preview')
    expect(video).toBeDefined()
    expect(video.tagName).toBe('VIDEO')
    expect(video.getAttribute('src')).toBe(baseProps.downloadUrl)
  })

  it('renders an audio element for audio/* mimetypes', () => {
    render(<FilePreview {...baseProps} filename="song.mp3" mimetype="audio/mpeg" />)

    const audio = screen.getByTestId('audio-preview')
    expect(audio).toBeDefined()
    expect(audio.tagName).toBe('AUDIO')
    expect(audio.getAttribute('src')).toBe(baseProps.downloadUrl)
  })

  it('renders an iframe for application/pdf', () => {
    render(<FilePreview {...baseProps} filename="report.pdf" mimetype="application/pdf" />)

    const iframe = screen.getByTestId('pdf-preview')
    expect(iframe).toBeDefined()
    expect(iframe.tagName).toBe('IFRAME')
    expect(iframe.getAttribute('src')).toBe(baseProps.downloadUrl)
  })

  it('renders a text preview for text/* mimetypes', () => {
    // Mock fetch for text content
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('console.log("hello")'),
    })

    render(<FilePreview {...baseProps} filename="script.js" mimetype="text/javascript" />)

    // The text preview fetches content asynchronously; initial render shows Loading
    expect(screen.getByText('Loading...')).toBeDefined()
  })

  it('renders a text preview for application/json', () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{"key": "value"}'),
    })

    render(<FilePreview {...baseProps} filename="data.json" mimetype="application/json" />)

    expect(screen.getByText('Loading...')).toBeDefined()
  })

  it('renders fallback with download button for unknown mimetypes', () => {
    render(<FilePreview {...baseProps} filename="data.bin" mimetype="application/octet-stream" />)

    const fallback = screen.getByTestId('fallback-preview')
    expect(fallback).toBeDefined()
    expect(screen.getByText('Download')).toBeDefined()
    expect(screen.getAllByText('data.bin').length).toBeGreaterThanOrEqual(1)
  })

  it('renders the overlay with close button', () => {
    render(<FilePreview {...baseProps} filename="photo.jpg" mimetype="image/jpeg" />)

    expect(screen.getByTestId('file-preview-overlay')).toBeDefined()
    expect(screen.getByLabelText('Close preview')).toBeDefined()
  })

  it('renders an img for image/png', () => {
    render(<FilePreview {...baseProps} filename="icon.png" mimetype="image/png" />)

    const img = screen.getByTestId('image-preview')
    expect(img.tagName).toBe('IMG')
  })

  it('renders video for video/webm', () => {
    render(<FilePreview {...baseProps} filename="demo.webm" mimetype="video/webm" />)

    const video = screen.getByTestId('video-preview')
    expect(video.tagName).toBe('VIDEO')
  })
})
