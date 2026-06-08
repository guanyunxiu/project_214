export interface ElectronAPI {
  selectFolder: () => Promise<{
    success: boolean
    files: Array<{
      id: string
      title: string
      artist: string
      album: string
      duration: number
      cover: string | null
      filePath: string
      fileSize: number
      bitrate: number
      year: number | null
      track: number | null
      genre: string | null
    }>
    folderPath?: string
    error?: string
  }>
  scanMultipleFiles: (filePaths: string[]) => Promise<{
    success: boolean
    files: Array<any>
    error?: string
  }>
  storeGet: (key: string) => Promise<any>
  storeSet: (key: string, value: any) => Promise<boolean>
  storeDelete: (key: string) => Promise<boolean>
  getDefaultMusicFolder: () => Promise<string>
  readFileAsUrl: (filePath: string) => Promise<string | null>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
