const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  scanMultipleFiles: (filePaths) => ipcRenderer.invoke('scan-multiple-files', filePaths),
  storeGet: (key) => ipcRenderer.invoke('store-get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store-set', key, value),
  storeDelete: (key) => ipcRenderer.invoke('store-delete', key),
  getDefaultMusicFolder: () => ipcRenderer.invoke('get-default-music-folder'),
  readFileAsUrl: (filePath) => ipcRenderer.invoke('read-file-as-url', filePath)
})
