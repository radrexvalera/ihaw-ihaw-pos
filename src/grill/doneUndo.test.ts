import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const setGrillStatus = vi.fn(async () => {})
vi.mock('../data/actions', () => ({ setGrillStatus }))

const { markDoneWithUndo, undoDone, flushDone, UNDO_MS } = await import('./doneUndo')

beforeEach(() => {
  vi.useFakeTimers()
  setGrillStatus.mockClear()
})
afterEach(() => vi.useRealTimers())

describe('DONE with undo', () => {
  it('commits once after the undo window', () => {
    markDoneWithUndo('o1')
    markDoneWithUndo('o1') // double tap
    vi.advanceTimersByTime(UNDO_MS - 1)
    expect(setGrillStatus).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(setGrillStatus).toHaveBeenCalledTimes(1)
    expect(setGrillStatus).toHaveBeenCalledWith('o1', 'done')
  })

  it('undo cancels the commit', () => {
    markDoneWithUndo('o2')
    undoDone('o2')
    vi.advanceTimersByTime(UNDO_MS * 2)
    expect(setGrillStatus).not.toHaveBeenCalled()
  })

  it('flush commits immediately (app hidden mid-window)', () => {
    markDoneWithUndo('o3')
    flushDone()
    expect(setGrillStatus).toHaveBeenCalledWith('o3', 'done')
    vi.advanceTimersByTime(UNDO_MS)
    expect(setGrillStatus).toHaveBeenCalledTimes(1)
  })
})
