// Service worker registration, "update ready" state and the install prompt.
import { useSyncExternalStore } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface PwaState {
  /** A new version is downloaded and waiting; applied only when the user taps UPDATE. */
  updateReady: boolean
  /** Android/Chrome install prompt, captured so we can offer our own Install button. */
  canInstall: boolean
}

let state: PwaState = { updateReady: false, canInstall: false }
let installEvent: BeforeInstallPromptEvent | null = null
let registration: ServiceWorkerRegistration | null = null
const listeners = new Set<() => void>()

function set(patch: Partial<PwaState>) {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}

export function usePwa(): PwaState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function watch(reg: ServiceWorkerRegistration) {
  // Only an UPDATE when a previous version already controls the page (not the first install).
  if (reg.waiting && navigator.serviceWorker.controller) set({ updateReady: true })
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) set({ updateReady: true })
    })
  })
}

const UPDATE_CHECK_MS = 30 * 60_000

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        registration = reg
        watch(reg)
        const check = () => void reg.update().catch(() => {})
        setInterval(check, UPDATE_CHECK_MS)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check()
        })
      })
      .catch(() => {
        // No service worker (private mode, old browser): the app still works online.
      })
  })

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installEvent = e as BeforeInstallPromptEvent
    set({ canInstall: true })
  })
  window.addEventListener('appinstalled', () => {
    installEvent = null
    set({ canInstall: false })
  })
}

/** Switches to the waiting version and reloads. The cart and all data survive (storage). */
export function applyUpdate(): void {
  const waiting = registration?.waiting
  if (!waiting) {
    window.location.reload()
    return
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
  waiting.postMessage('SKIP_WAITING')
}

export async function promptInstall(): Promise<void> {
  if (!installEvent) return
  await installEvent.prompt()
  await installEvent.userChoice
  installEvent = null
  set({ canInstall: false })
}

/**
 * Asks the browser not to evict our IndexedDB under storage pressure — unsynced
 * sales live there. Granted automatically for installed apps on most browsers.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}
