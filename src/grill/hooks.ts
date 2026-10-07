import { useEffect, useRef, useState } from 'react'

/** Current time, refreshed every `intervalMs` (drives the waiting timers). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

/** Keeps the screen on while mounted (Screen Wake Lock API, where supported). */
export function useWakeLock(): void {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const acquire = async () => {
      if (document.visibilityState !== 'visible' || cancelled) return
      try {
        lock = await navigator.wakeLock.request('screen')
      } catch {
        // Denied (battery saver, unsupported browser): the screen may sleep; nothing else breaks.
      }
    }
    // The lock is released when the tab is hidden; take it again on return.
    const onVisible = () => void acquire()
    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release().catch(() => {})
    }
  }, [])
}

let audio: AudioContext | null = null

/** Browsers only allow sound after a user gesture; call from any tap on the grill screen. */
export function unlockAudio(): void {
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume()
  } catch {
    // No Web Audio: alerts fall back to vibration only.
  }
}

/** Two short, loud beeps — audible over a grill. */
export function beep(): void {
  navigator.vibrate?.([200, 100, 200])
  if (!audio || audio.state !== 'running') return
  const t0 = audio.currentTime
  for (const offset of [0, 0.25]) {
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'square'
    osc.frequency.value = 1320
    gain.gain.setValueAtTime(0.25, t0 + offset)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + offset + 0.18)
    osc.connect(gain).connect(audio.destination)
    osc.start(t0 + offset)
    osc.stop(t0 + offset + 0.2)
  }
}

/** Calls `onNew` whenever an id appears that was not in the previous list (not on first load). */
export function useNewIdAlert(ids: readonly string[] | undefined, onNew: () => void): void {
  const seen = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!ids) return
    if (seen.current && ids.some((id) => !seen.current!.has(id))) onNew()
    seen.current = new Set(ids)
  }, [ids, onNew])
}
