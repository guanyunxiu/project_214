const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const mm = require('music-metadata')
const chokidar = require('chokidar')

let mainWindow = null
const watchers = new Map()
const md5Cache = new Map()

const STORE_PATH = path.join(app.getPath('userData'), 'config.json')
const storeData = {}

function storeLoad() {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8')
      const parsed = JSON.parse(raw)
      Object.assign(storeData, parsed)
    }
  } catch (e) {
    console.error('加载存储失败:', e)
  }
}

function storeSave() {
  try {
    const tmpPath = STORE_PATH + '.tmp-' + Date.now()
    fs.writeFileSync(tmpPath, JSON.stringify(storeData, null, 2), 'utf-8')
    fs.renameSync(tmpPath, STORE_PATH)
  } catch (e) {
    console.error('保存存储失败:', e)
    try {
      fs.writeFileSync(STORE_PATH, JSON.stringify(storeData, null, 2), 'utf-8')
    } catch (e2) {
      console.error('直接写入存储也失败:', e2)
    }
  }
}

function storeGet(key) {
  return storeData[key] !== undefined ? storeData[key] : null
}

function storeSet(key, value) {
  storeData[key] = value
  storeSave()
}

function storeDelete(key) {
  delete storeData[key]
  storeSave()
}

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
    mainWindow.loadURL('http://localhost:5188')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  storeData.settings = {
    volume: 0.8,
    playMode: 'sequence',
    musicFolders: [],
    fadeInDuration: 1.0,
    fadeOutDuration: 1.0,
    gainNormalization: false
  }
  storeData.playlist = []
  storeData.customPlaylists = []
  storeData.playHistory = []
  storeLoad()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  stopAllWatchers()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

const SUPPORTED_EXTENSIONS = ['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.wma']

async function computeMD5(filePath) {
  if (md5Cache.has(filePath)) {
    return md5Cache.get(filePath)
  }
  return new Promise((resolve) => {
    const hash = crypto.createHash('md5')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (data) => hash.update(data))
    stream.on('end', () => {
      const md5 = hash.digest('hex')
      md5Cache.set(filePath, md5)
      resolve(md5)
    })
    stream.on('error', () => {
      resolve(null)
    })
  })
}

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
    const md5 = await computeMD5(filePath)

    let replayGain = null
    if (metadata.native) {
      for (const format of Object.values(metadata.native)) {
        for (const tag of format) {
          if (tag.id === 'replaygain_track_gain') {
            replayGain = parseFloat(tag.value)
            break
          }
        }
        if (replayGain !== null) break
      }
    }

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
      genre: metadata.common.genre ? metadata.common.genre.join(', ') : null,
      md5: md5,
      replayGain: replayGain,
      missing: false
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
      genre: null,
      md5: null,
      replayGain: null,
      missing: false
    }
  }
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data)
  }
}

function startWatchingFolder(folderPath) {
  if (watchers.has(folderPath)) return

  const watcher = chokidar.watch(folderPath, {
    ignored: (filePath) => {
      try {
        const stat = fs.statSync(filePath, { throwIfNoEntry: false })
        if (!stat) return true
        if (stat.isDirectory()) return false
        const ext = path.extname(filePath).toLowerCase()
        return !SUPPORTED_EXTENSIONS.includes(ext)
      } catch {
        return true
      }
    },
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 500
    }
  })

  watcher.on('add', async (filePath) => {
    const metadata = await parseMetadata(filePath)
    sendToRenderer('folder-change', { type: 'add', song: metadata, folderPath })
  })

  watcher.on('unlink', async (filePath) => {
    const songId = Buffer.from(filePath).toString('base64')
    sendToRenderer('folder-change', { type: 'delete', songId, filePath, folderPath })
  })

  watcher.on('change', async (filePath) => {
    const metadata = await parseMetadata(filePath)
    sendToRenderer('folder-change', { type: 'modify', song: metadata, folderPath })
  })

  watchers.set(folderPath, watcher)
}

function stopWatchingFolder(folderPath) {
  const watcher = watchers.get(folderPath)
  if (watcher) {
    watcher.close()
    watchers.delete(folderPath)
  }
}

function stopAllWatchers() {
  for (const [folderPath, watcher] of watchers) {
    watcher.close()
  }
  watchers.clear()
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

    try {
      const musicFolders = storeGet('settings.musicFolders') || []
      if (!musicFolders.includes(folderPath)) {
        musicFolders.push(folderPath)
        storeSet('settings.musicFolders', musicFolders)
      }
    } catch (e) {
      console.error('保存音乐文件夹设置失败:', e)
    }

    startWatchingFolder(folderPath)

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

ipcMain.handle('start-watching', (event, folderPath) => {
  startWatchingFolder(folderPath)
  return true
})

ipcMain.handle('stop-watching', (event, folderPath) => {
  stopWatchingFolder(folderPath)
  try {
    const musicFolders = storeGet('settings.musicFolders') || []
    const idx = musicFolders.indexOf(folderPath)
    if (idx >= 0) {
      musicFolders.splice(idx, 1)
      storeSet('settings.musicFolders', musicFolders)
    }
  } catch (e) {
    console.error('更新监控文件夹失败:', e)
  }
  return true
})

ipcMain.handle('get-watched-folders', () => {
  return storeGet('settings.musicFolders') || []
})

ipcMain.handle('check-files-exist', async (event, filePaths) => {
  const results = {}
  for (const filePath of filePaths) {
    try {
      await fs.promises.access(filePath, fs.constants.R_OK)
      results[filePath] = true
    } catch {
      results[filePath] = false
    }
  }
  return results
})

ipcMain.handle('compute-md5', async (event, filePath) => {
  return await computeMD5(filePath)
})

ipcMain.handle('store-get', (event, key) => {
  return storeGet(key)
})

ipcMain.handle('store-set', (event, key, value) => {
  try {
    storeSet(key, value)
    return true
  } catch (e) {
    console.error('store-set 失败:', e)
    return false
  }
})

ipcMain.handle('store-delete', (event, key) => {
  try {
    storeDelete(key)
    return true
  } catch (e) {
    console.error('store-delete 失败:', e)
    return false
  }
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

ipcMain.handle('export-m3u', async (event, playlistData, filePath) => {
  try {
    const lines = ['#EXTM3U']
    for (const song of playlistData) {
      const duration = song.duration || -1
      const artist = song.artist || ''
      const title = song.title || ''
      lines.push(`#EXTINF:${duration},${artist} - ${title}`)
      lines.push(song.filePath)
    }
    await fs.promises.writeFile(filePath, lines.join('\n'), 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('导出M3U失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('import-m3u', async (event, filePath) => {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8')
    const lines = content.split('\n').map(l => l.trim()).filter(l => l)
    const songs = []
    let currentInfo = null

    for (const line of lines) {
      if (line.startsWith('#EXTM3U')) continue
      if (line.startsWith('#EXTINF:')) {
        const match = line.match(/^#EXTINF:\s*(-?\d+)\s*,\s*(.*)$/)
        if (match) {
          currentInfo = { duration: parseInt(match[1]), title: match[2] }
        }
        continue
      }
      if (line.startsWith('#')) continue

      let audioPath = line
      if (!path.isAbsolute(audioPath)) {
        audioPath = path.resolve(path.dirname(filePath), audioPath)
      }

      const ext = path.extname(audioPath).toLowerCase()
      if (SUPPORTED_EXTENSIONS.includes(ext)) {
        try {
          await fs.promises.access(audioPath, fs.constants.R_OK)
          const metadata = await parseMetadata(audioPath)
          songs.push(metadata)
        } catch {
          if (currentInfo) {
            songs.push({
              id: Buffer.from(audioPath).toString('base64'),
              title: currentInfo.title || path.basename(audioPath),
              artist: '未知艺术家',
              album: '未知专辑',
              duration: currentInfo.duration > 0 ? currentInfo.duration : 0,
              cover: null,
              filePath: audioPath,
              fileSize: 0,
              bitrate: 0,
              year: null,
              track: null,
              genre: null,
              md5: null,
              replayGain: null,
              missing: true
            })
          }
        }
      }
      currentInfo = null
    }
    return { success: true, files: songs }
  } catch (error) {
    console.error('导入M3U失败:', error)
    return { success: false, files: [], error: error.message }
  }
})

ipcMain.handle('export-plist', async (event, playlistData, filePath) => {
  try {
    const plistObj = {
      tracks: playlistData.map((song, index) => ({
        'Track ID': index + 1,
        Name: song.title || '',
        Artist: song.artist || '',
        Album: song.album || '',
        Location: song.filePath,
        'Total Time': (song.duration || 0) * 1000
      }))
    }

    let plistXml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    plistXml += '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
    plistXml += '<plist version="1.0">\n<dict>\n'
    plistXml += '  <key>Tracks</key>\n  <dict>\n'

    for (let i = 0; i < plistObj.tracks.length; i++) {
      const track = plistObj.tracks[i]
      plistXml += `    <key>${track['Track ID']}</key>\n    <dict>\n`
      plistXml += `      <key>Track ID</key><integer>${track['Track ID']}</integer>\n`
      plistXml += `      <key>Name</key><string>${escapeXml(track.Name)}</string>\n`
      plistXml += `      <key>Artist</key><string>${escapeXml(track.Artist)}</string>\n`
      plistXml += `      <key>Album</key><string>${escapeXml(track.Album)}</string>\n`
      plistXml += `      <key>Location</key><string>${escapeXml(track.Location)}</string>\n`
      plistXml += `      <key>Total Time</key><integer>${track['Total Time']}</integer>\n`
      plistXml += `    </dict>\n`
    }

    plistXml += '  </dict>\n'
    plistXml += '  <key>Playlist Items</key>\n  <array>\n'
    for (let i = 0; i < plistObj.tracks.length; i++) {
      plistXml += `    <dict><key>Track ID</key><integer>${i + 1}</integer></dict>\n`
    }
    plistXml += '  </array>\n'
    plistXml += '</dict>\n</plist>'

    await fs.promises.writeFile(filePath, plistXml, 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('导出plist失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('import-plist', async (event, filePath) => {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8')
    const locations = []
    const locationRegex = /<key>Location<\/key>\s*<string>(.*?)<\/string>/gi
    let match
    while ((match = locationRegex.exec(content)) !== null) {
      locations.push(unescapeXml(match[1]))
    }

    const songs = []
    for (const loc of locations) {
      const audioPath = loc.replace('file://', '').replace('file:', '')
      const ext = path.extname(audioPath).toLowerCase()
      if (SUPPORTED_EXTENSIONS.includes(ext)) {
        try {
          await fs.promises.access(audioPath, fs.constants.R_OK)
          const metadata = await parseMetadata(audioPath)
          songs.push(metadata)
        } catch {
          songs.push({
            id: Buffer.from(audioPath).toString('base64'),
            title: path.basename(audioPath),
            artist: '未知艺术家',
            album: '未知专辑',
            duration: 0,
            cover: null,
            filePath: audioPath,
            fileSize: 0,
            bitrate: 0,
            year: null,
            track: null,
            genre: null,
            md5: null,
            replayGain: null,
            missing: true
          })
        }
      }
    }
    return { success: true, files: songs }
  } catch (error) {
    console.error('导入plist失败:', error)
    return { success: false, files: [], error: error.message }
  }
})

ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options)
  return result
})

ipcMain.handle('show-open-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options)
  return result
})

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function unescapeXml(str) {
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}
