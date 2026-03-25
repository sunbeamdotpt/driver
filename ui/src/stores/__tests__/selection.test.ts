import { describe, it, expect, beforeEach } from 'vitest'
import { useSelectionStore } from '../selection'

describe('selection store', () => {
  beforeEach(() => {
    useSelectionStore.setState({ selectedIds: new Set() })
  })

  it('starts with empty selection', () => {
    const state = useSelectionStore.getState()
    expect(state.selectedIds.size).toBe(0)
  })

  it('select adds an id', () => {
    useSelectionStore.getState().select('file-1')
    expect(useSelectionStore.getState().selectedIds.has('file-1')).toBe(true)
  })

  it('deselect removes an id', () => {
    useSelectionStore.getState().select('file-1')
    useSelectionStore.getState().deselect('file-1')
    expect(useSelectionStore.getState().selectedIds.has('file-1')).toBe(false)
  })

  it('toggle adds if not present', () => {
    useSelectionStore.getState().toggle('file-1')
    expect(useSelectionStore.getState().selectedIds.has('file-1')).toBe(true)
  })

  it('toggle removes if present', () => {
    useSelectionStore.getState().select('file-1')
    useSelectionStore.getState().toggle('file-1')
    expect(useSelectionStore.getState().selectedIds.has('file-1')).toBe(false)
  })

  it('clear empties the selection', () => {
    useSelectionStore.getState().select('file-1')
    useSelectionStore.getState().select('file-2')
    useSelectionStore.getState().clear()
    expect(useSelectionStore.getState().selectedIds.size).toBe(0)
  })

  it('selectAll sets all ids', () => {
    useSelectionStore.getState().selectAll(['a', 'b', 'c'])
    const ids = useSelectionStore.getState().selectedIds
    expect(ids.size).toBe(3)
    expect(ids.has('a')).toBe(true)
    expect(ids.has('b')).toBe(true)
    expect(ids.has('c')).toBe(true)
  })

  it('selectAll replaces previous selection', () => {
    useSelectionStore.getState().select('old')
    useSelectionStore.getState().selectAll(['new-1', 'new-2'])
    const ids = useSelectionStore.getState().selectedIds
    expect(ids.has('old')).toBe(false)
    expect(ids.size).toBe(2)
  })

  it('multiple operations in sequence', () => {
    const store = useSelectionStore.getState()
    store.select('a')
    store.select('b')
    store.select('c')
    store.deselect('b')
    const ids = useSelectionStore.getState().selectedIds
    expect(ids.size).toBe(2)
    expect(ids.has('a')).toBe(true)
    expect(ids.has('c')).toBe(true)
  })
})
