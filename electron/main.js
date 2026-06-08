const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const mm = require('music-metadata')
const Store = require('electron-store')

let mainWindow = null
let store = null

function createWindow() {
  const isDev = process.env.NODE_ENV === 'development'
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    frame: true
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  store = new Store({
    defaults: {
      settings: {
        volume: 0.8,
        playMode: 'sequence',
        musicFolders: []
      },
      playlist: []
    }
  })
  
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

const SUPPORTED_EXTENSIONS = ['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.wma']

async function scanDirectory(dir) {
  const results = []
  const entries = await fs.promises.readdir(dir, { withFileTypes: true })
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const subResults = await scanDirectory(fullPath)
      results.push(...subResults)
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (SUPPORTED_EXTENSIONS.includes(ext)) {
        results.push(fullPath)
      }
    }
  }
  return results
}

async function parseMetadata(filePath) {
  try {
    const metadata = await mm.parseFile(filePath, {
      duration: true,
      skipCovers: false
    })

    let coverData = null
    if (metadata.common.picture && metadata.common.picture.length > 0) {
      const pic = metadata.common.picture[0]
      coverData = `data:${pic.format};base64,${pic.data.toString('base64')}`
    }

    const stat = await fs.promises.stat(filePath)
    
    return {
      id: Buffer.from(filePath).toString('base64'),
      title: metadata.common.title || path.basename(filePath, path.extname(filePath)),
      artist: metadata.common.artist || '未知艺术家',
      album: metadata.common.album || '未知专辑',
      duration: Math.round(metadata.format.duration || 0),
      cover: coverData,
      filePath: filePath,
      fileSize: stat.size,
      bitrate: Math.round((metadata.format.bitrate || 0) / 1000),
      year: metadata.common.year || null,
      track: metadata.common.track ? metadata.common.track.no : null,
      genre: metadata.common.genre ? metadata.common.genre.join(', ') : null
    }
  } catch (error) {
    console.error('解析元数据失败:', filePath, error)
    return {
      id: Buffer.from(filePath).toString('base64'),
      title: path.basename(filePath, path.extname(filePath)),
      artist: '未知艺术家',
      album: '未知专辑',
      duration: 0,
      cover: null,
      filePath: filePath,
      fileSize: 0,
      bitrate: 0,
      year: null,
      track: null,
      genre: null
    }
  }
}

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  })
  
  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, files: [] }
  }

  try {
    const folderPath = result.filePaths[0]
    const files = await scanDirectory(folderPath)
    
    const songs = []
    for (const file of files) {
      const metadata = await parseMetadata(file)
      songs.push(metadata)
    }

    return { success: true, files: songs, folderPath }
  } catch (error) {
    console.error('扫描目录失败:', error)
    return { success: false, files: [], error: error.message }
  }
})

ipcMain.handle('scan-multiple-files', async (event, filePaths) => {
  try {
    const songs = []
    for (const file of filePaths) {
      const ext = path.extname(file).toLowerCase()
      if (SUPPORTED_EXTENSIONS.includes(ext)) {
        const metadata = await parseMetadata(file)
        songs.push(metadata)
      }
    }
    return { success: true, files: songs }
  } catch (error) {
    console.error('解析文件失败:', error)
    return { success: false, files: [], error: error.message }
  }
})

ipcMain.handle('store-get', (event, key) => {
  if (!store) return null
  return store.get(key)
})

ipcMain.handle('store-set', (event, key, value) => {
  if (!store) return false
  store.set(key, value)
  return true
})

ipcMain.handle('store-delete', (event, key) => {
  if (!store) return false
  store.delete(key)
  return true
})

ipcMain.handle('get-default-music-folder', () => {
  const home = app.getPath('music')
  return home
})

ipcMain.handle('read-file-as-url', async (event, filePath) => {
  try {
    const data = await fs.promises.readFile(filePath)
    const ext = path.extname(filePath).toLowerCase().slice(1)
    let mimeType = 'audio/mpeg'
    if (ext === 'flac') mimeType = 'audio/flac'
    else if (ext === 'wav') mimeType = 'audio/wav'
    else if (ext === 'm4a') mimeType = 'audio/mp4'
    else if (ext === 'aac') mimeType = 'audio/aac'
    else if (ext === 'ogg') mimeType = 'audio/ogg'
    else if (ext === 'wma') mimeType = 'audio/x-ms-wma'
    
    return `data:${mimeType};base64,${data.toString('base64')}`
  } catch (error) {
    console.error('读取文件失败:', error)
    return null
  }
})
