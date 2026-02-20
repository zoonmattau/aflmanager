/**
 * Ambient type declarations for optional Tauri packages.
 * These are only used at runtime when IS_TAURI is true.
 */

declare module '@tauri-apps/plugin-fs' {
  export type BaseDirectory = number
  export const BaseDirectory: { Document: BaseDirectory; [key: string]: BaseDirectory }
  export function readTextFile(path: string, options?: { baseDir?: BaseDirectory }): Promise<string>
  export function writeTextFile(path: string, contents: string, options?: { baseDir?: BaseDirectory }): Promise<void>
  export function exists(path: string, options?: { baseDir?: BaseDirectory }): Promise<boolean>
  export function remove(path: string, options?: { baseDir?: BaseDirectory }): Promise<void>
  export function mkdir(path: string, options?: { baseDir?: BaseDirectory; recursive?: boolean }): Promise<void>
}

declare module '@tauri-apps/plugin-dialog' {
  export interface OpenDialogOptions { multiple?: boolean; filters?: { name: string; extensions: string[] }[] }
  export function open(options?: OpenDialogOptions): Promise<string | string[] | null>
  export function save(options?: object): Promise<string | null>
}

declare module '@tauri-apps/api/core' {
  export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>
}
