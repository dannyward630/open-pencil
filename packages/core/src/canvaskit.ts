/// <reference types="vite/client" />
import CanvasKitInit, { type CanvasKit } from 'canvaskit-wasm'

import { IS_BROWSER } from './constants'

let instance: CanvasKit | null = null

export interface CanvasKitOptions {
  locateFile?: (file: string) => string
}

export async function getCanvasKit(options?: CanvasKitOptions): Promise<CanvasKit> {
  if (instance) return instance

  let locateFile = options?.locateFile
  if (!locateFile) {
    if (IS_BROWSER) {
      const base = 'env' in import.meta ? import.meta.env.BASE_URL : '/'
      const prefix = base === '/' ? '' : base.replace(/\/$/, '')
      locateFile = (file) => `${prefix}/${file}`
    } else {
      const { fileURLToPath } = await import(/* @vite-ignore */ 'node:url')
      const ckPath = import.meta.resolve('canvaskit-wasm')
      locateFile = (file) => fileURLToPath(new URL(file, ckPath))
    }
  }

  instance = await CanvasKitInit({
    locateFile
  })

  return instance
}
