import { createContext, useContext } from 'react'
import type { Device } from '../lib/types'

export const DeviceContext = createContext<Device | null>(null)

/** This phone's registration. Only available inside the running app shell. */
export function useDevice(): Device {
  const device = useContext(DeviceContext)
  if (!device) throw new Error('useDevice used outside the app shell')
  return device
}
