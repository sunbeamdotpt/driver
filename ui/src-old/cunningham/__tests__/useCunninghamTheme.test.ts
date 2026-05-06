import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useCunninghamTheme } from '../useCunninghamTheme'

describe('useCunninghamTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    useCunninghamTheme.setState({ theme: 'default' })
  })

  it('starts with default theme', () => {
    expect(useCunninghamTheme.getState().theme).toBe('default')
  })

  it('setTheme updates theme', () => {
    useCunninghamTheme.getState().setTheme('dark')
    expect(useCunninghamTheme.getState().theme).toBe('dark')
  })

  it('setTheme persists to localStorage', () => {
    useCunninghamTheme.getState().setTheme('dark')
    expect(localStorage.getItem('cunningham-theme')).toBe('dark')
  })

  it('toggle from default goes to dark', () => {
    useCunninghamTheme.setState({ theme: 'default' })
    useCunninghamTheme.getState().toggle()
    expect(useCunninghamTheme.getState().theme).toBe('dark')
  })

  it('toggle from dark goes to default', () => {
    useCunninghamTheme.setState({ theme: 'dark' })
    useCunninghamTheme.getState().toggle()
    expect(useCunninghamTheme.getState().theme).toBe('default')
  })

  it('toggle from custom-light goes to custom-dark', () => {
    useCunninghamTheme.setState({ theme: 'custom-light' })
    useCunninghamTheme.getState().toggle()
    expect(useCunninghamTheme.getState().theme).toBe('custom-dark')
  })

  it('toggle from custom-dark goes to custom-light', () => {
    useCunninghamTheme.setState({ theme: 'custom-dark' })
    useCunninghamTheme.getState().toggle()
    expect(useCunninghamTheme.getState().theme).toBe('custom-light')
  })

  it('toggle persists to localStorage', () => {
    useCunninghamTheme.setState({ theme: 'default' })
    useCunninghamTheme.getState().toggle()
    expect(localStorage.getItem('cunningham-theme')).toBe('dark')
  })
})
