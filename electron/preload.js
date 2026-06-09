const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  scanMultipleFiles: (filePaths) => ipcRenderer.invoke('scan-multiple-files', filePaths),
  storeGet: (key) => ipcRenderer.invoke('store-get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store-set', key, value),
  storeDelete: (key) => ipcRenderer.invoke('store-delete', key),
  getDefaultMusicFolder: () => ipcRenderer.invoke('get-default-music-folder'),
  readFileAsUrl: (filePath) => ipcRenderer.invoke('read-file-as-url', filePath),
  startWatching: (folderPath) => ipcRenderer.invoke('start-watching', folderPath),
  stopWatching: (folderPath) => ipcRenderer.invoke('stop-watching', folderPath),
  getWatchedFolders: () => ipcRenderer.invoke('get-watched-folders'),
  checkFilesExist: (filePaths) => ipcRenderer.invoke('check-files-exist', filePaths),
  computeMd5: (filePath) => ipcRenderer.invoke('compute-md5', filePath),
  exportM3u: (playlistData, filePath) => ipcRenderer.invoke('export-m3u', playlistData, filePath),
  importM3u: (filePath) => ipcRenderer.invoke('import-m3u', filePath),
  exportPlist: (playlistData, filePath) => ipcRenderer.invoke('export-plist', playlistData, filePath),
  importPlist: (filePath) => ipcRenderer.invoke('import-plist', filePath),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  onFolderChange: (callback) => {
    const handler = (event, data) => callback(data)
    ipcRenderer.on('folder-change', handler)
    return () => ipcRenderer.removeListener('folder-change', handler)
  }
})
