import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const usePlayerStore = defineStore('player', () => {
  const playlist = ref([])
  const currentIndex = ref(-1)
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  const volume = ref(0.8)
  const playMode = ref('sequence')
  const isMuted = ref(false)
  const isLoading = ref(false)
  const currentAudioUrl = ref(null)
  const playHistory = ref([])
  const customPlaylists = ref([])
  const activePlaylistId = ref(null)
  const fadeInDuration = ref(1.0)
  const fadeOutDuration = ref(1.0)
  const gainNormalization = ref(false)
  const watchedFolders = ref([])

  const MAX_HISTORY = 50

  const currentSong = computed(() => {
    if (currentIndex.value >= 0 && currentIndex.value < playlist.value.length) {
      return playlist.value[currentIndex.value]
    }
    return null
  })

  const activePlaylist = computed(() => {
    if (!activePlaylistId.value) return null
    return customPlaylists.value.find(p => p.id === activePlaylistId.value) || null
  })

  const playModeText = computed(() => {
    const modes = {
      'sequence': '顺序播放',
      'loop': '列表循环',
      'single': '单曲循环'
    }
    return modes[playMode.value] || '顺序播放'
  })

  const playModeIcon = computed(() => {
    const icons = {
      'sequence': '🔁',
      'loop': '🔂',
      'single': '🔂'
    }
    return icons[playMode.value] || '🔁'
  })

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  function isDuplicate(newSong) {
    return playlist.value.some(existing => {
      if (existing.filePath === newSong.filePath) return true
      if (existing.md5 && newSong.md5 && existing.md5 === newSong.md5) return true
      return false
    })
  }

  function addSongs(songs) {
    const newSongs = songs.filter(s => !isDuplicate(s))
    playlist.value.push(...newSongs)
    saveToStorage()
    return newSongs.length
  }

  function addSongFromWatch(song) {
    if (isDuplicate(song)) return
    playlist.value.push(song)
    saveToStorage()
  }

  function removeSongByPath(filePath) {
    const idx = playlist.value.findIndex(s => s.filePath === filePath)
    if (idx >= 0) {
      removeSong(idx)
    }
  }

  function updateSongFromWatch(song) {
    const idx = playlist.value.findIndex(s => s.filePath === song.filePath)
    if (idx >= 0) {
      playlist.value[idx] = { ...playlist.value[idx], ...song }
      saveToStorage()
    }
  }

  function markMissingFiles(existMap) {
    let changed = false
    for (const song of playlist.value) {
      const exists = existMap[song.filePath]
      if (exists === undefined) continue
      const newMissing = !exists
      if (song.missing !== newMissing) {
        song.missing = newMissing
        changed = true
      }
    }
    if (changed) saveToStorage()
  }

  function setPlaylist(songs) {
    playlist.value = songs
    if (currentIndex.value >= songs.length) {
      currentIndex.value = songs.length > 0 ? 0 : -1
    }
    saveToStorage()
  }

  function reorderPlaylist(fromIndex, toIndex) {
    if (fromIndex === toIndex) return
    if (fromIndex < 0 || fromIndex >= playlist.value.length) return
    if (toIndex < 0 || toIndex >= playlist.value.length) return
    const [item] = playlist.value.splice(fromIndex, 1)
    playlist.value.splice(toIndex, 0, item)
    if (currentIndex.value === fromIndex) {
      currentIndex.value = toIndex
    } else if (fromIndex < currentIndex.value && toIndex >= currentIndex.value) {
      currentIndex.value--
    } else if (fromIndex > currentIndex.value && toIndex <= currentIndex.value) {
      currentIndex.value++
    }
    saveToStorage()
  }

  function removeSong(index) {
    if (index < 0 || index >= playlist.value.length) return

    playlist.value.splice(index, 1)

    if (index < currentIndex.value) {
      currentIndex.value--
    } else if (index === currentIndex.value) {
      if (playlist.value.length === 0) {
        currentIndex.value = -1
        isPlaying.value = false
        currentAudioUrl.value = null
      } else if (index >= playlist.value.length) {
        currentIndex.value = playlist.value.length - 1
      }
    }
    saveToStorage()
  }

  function clearPlaylist() {
    playlist.value = []
    currentIndex.value = -1
    isPlaying.value = false
    currentTime.value = 0
    duration.value = 0
    currentAudioUrl.value = null
    saveToStorage()
  }

  function addToPlayHistory(song) {
    if (!song) return
    playHistory.value = playHistory.value.filter(
      h => h.filePath !== song.filePath
    )
    playHistory.value.unshift({
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      duration: song.duration,
      cover: song.cover,
      filePath: song.filePath,
      playedAt: Date.now()
    })
    if (playHistory.value.length > MAX_HISTORY) {
      playHistory.value = playHistory.value.slice(0, MAX_HISTORY)
    }
    savePlayHistory()
  }

  function clearPlayHistory() {
    playHistory.value = []
    savePlayHistory()
  }

  function createPlaylist(name) {
    const newPlaylist = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      songs: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    customPlaylists.value.push(newPlaylist)
    saveCustomPlaylists()
    return newPlaylist
  }

  function deletePlaylist(playlistId) {
    const idx = customPlaylists.value.findIndex(p => p.id === playlistId)
    if (idx >= 0) {
      customPlaylists.value.splice(idx, 1)
      if (activePlaylistId.value === playlistId) {
        activePlaylistId.value = null
      }
      saveCustomPlaylists()
    }
  }

  function renamePlaylist(playlistId, newName) {
    const pl = customPlaylists.value.find(p => p.id === playlistId)
    if (pl) {
      pl.name = newName
      pl.updatedAt = Date.now()
      saveCustomPlaylists()
    }
  }

  function addSongToPlaylist(playlistId, song) {
    const pl = customPlaylists.value.find(p => p.id === playlistId)
    if (pl) {
      if (!pl.songs.some(s => s.filePath === song.filePath)) {
        pl.songs.push({ ...song })
        pl.updatedAt = Date.now()
        saveCustomPlaylists()
      }
    }
  }

  function removeSongFromPlaylist(playlistId, songIndex) {
    const pl = customPlaylists.value.find(p => p.id === playlistId)
    if (pl && songIndex >= 0 && songIndex < pl.songs.length) {
      pl.songs.splice(songIndex, 1)
      pl.updatedAt = Date.now()
      saveCustomPlaylists()
    }
  }

  function reorderPlaylistSongs(playlistId, fromIndex, toIndex) {
    const pl = customPlaylists.value.find(p => p.id === playlistId)
    if (!pl) return
    if (fromIndex === toIndex) return
    const [item] = pl.songs.splice(fromIndex, 1)
    pl.songs.splice(toIndex, 0, item)
    pl.updatedAt = Date.now()
    saveCustomPlaylists()
  }

  function loadPlaylistToMain(playlistId) {
    const pl = customPlaylists.value.find(p => p.id === playlistId)
    if (pl) {
      addSongs(pl.songs)
    }
  }

  function playSong(index) {
    if (index < 0 || index >= playlist.value.length) return
    const song = playlist.value[index]
    if (song.missing) return
    const isSameSong = currentIndex.value === index
    currentIndex.value = index
    isPlaying.value = true
    currentTime.value = 0
    if (song) addToPlayHistory(song)
    if (isSameSong) {
      currentAudioUrl.value = null
    }
  }

  function togglePlay() {
    if (currentIndex.value === -1 && playlist.value.length > 0) {
      currentIndex.value = 0
      isPlaying.value = true
      if (playlist.value[0]) addToPlayHistory(playlist.value[0])
      return
    }
    isPlaying.value = !isPlaying.value
  }

  function playNext() {
    if (playlist.value.length === 0) return

    if (playMode.value === 'single') {
      currentTime.value = 0
      isPlaying.value = true
      return
    }

    let nextIndex = currentIndex.value + 1
    if (nextIndex >= playlist.value.length) {
      if (playMode.value === 'loop') {
        nextIndex = 0
      } else {
        isPlaying.value = false
        return
      }
    }
    const song = playlist.value[nextIndex]
    currentIndex.value = nextIndex
    isPlaying.value = true
    currentTime.value = 0
    if (song) addToPlayHistory(song)
  }

  function playPrevious() {
    if (playlist.value.length === 0) return

    if (currentTime.value > 3) {
      currentTime.value = 0
      return
    }

    let prevIndex = currentIndex.value - 1
    if (prevIndex < 0) {
      prevIndex = playlist.value.length - 1
    }
    const song = playlist.value[prevIndex]
    currentIndex.value = prevIndex
    isPlaying.value = true
    currentTime.value = 0
    if (song) addToPlayHistory(song)
  }

  function togglePlayMode() {
    const modes = ['sequence', 'loop', 'single']
    const currentModeIndex = modes.indexOf(playMode.value)
    const nextModeIndex = (currentModeIndex + 1) % modes.length
    playMode.value = modes[nextModeIndex]
    saveSettings()
  }

  function setVolume(newVolume) {
    volume.value = Math.max(0, Math.min(1, newVolume))
    if (volume.value > 0) {
      isMuted.value = false
    }
    saveSettings()
  }

  function toggleMute() {
    isMuted.value = !isMuted.value
  }

  function seekTo(time) {
    currentTime.value = Math.max(0, Math.min(duration.value, time))
  }

  function setDuration(newDuration) {
    duration.value = newDuration
  }

  function setCurrentTime(time) {
    currentTime.value = time
  }

  function setCurrentAudioUrl(url) {
    currentAudioUrl.value = url
  }

  function setLoading(loading) {
    isLoading.value = loading
  }

  function setFadeInDuration(val) {
    fadeInDuration.value = val
    saveSettings()
  }

  function setFadeOutDuration(val) {
    fadeOutDuration.value = val
    saveSettings()
  }

  function setGainNormalization(val) {
    gainNormalization.value = val
    saveSettings()
  }

  function stripCoverForIPC(song) {
    const { cover, ...rest } = song
    return rest
  }

  function stripPlaylistForIPC(songs) {
    return JSON.parse(JSON.stringify(songs.map(stripCoverForIPC)))
  }

  async function saveToStorage() {
    if (window.electronAPI) {
      try {
        await window.electronAPI.storeSet('playlist', stripPlaylistForIPC(playlist.value))
      } catch (e) {
        console.error('保存播放列表失败:', e)
      }
    }
  }

  async function saveSettings() {
    if (window.electronAPI) {
      try {
        await window.electronAPI.storeSet('settings', {
          volume: volume.value,
          playMode: playMode.value,
          fadeInDuration: fadeInDuration.value,
          fadeOutDuration: fadeOutDuration.value,
          gainNormalization: gainNormalization.value
        })
      } catch (e) {
        console.error('保存设置失败:', e)
      }
    }
  }

  async function savePlayHistory() {
    if (window.electronAPI) {
      try {
        await window.electronAPI.storeSet('playHistory', stripPlaylistForIPC(playHistory.value))
      } catch (e) {
        console.error('保存播放历史失败:', e)
      }
    }
  }

  async function saveCustomPlaylists() {
    if (window.electronAPI) {
      try {
        const data = JSON.parse(JSON.stringify(customPlaylists.value.map(pl => ({
          ...pl,
          songs: stripPlaylistForIPC(pl.songs)
        }))))
        await window.electronAPI.storeSet('customPlaylists', data)
      } catch (e) {
        console.error('保存自定义歌单失败:', e)
      }
    }
  }

  async function loadFromStorage() {
    if (window.electronAPI) {
      try {
        const savedPlaylist = await window.electronAPI.storeGet('playlist')
        const savedSettings = await window.electronAPI.storeGet('settings')
        const savedHistory = await window.electronAPI.storeGet('playHistory')
        const savedCustomPlaylists = await window.electronAPI.storeGet('customPlaylists')

        if (savedPlaylist && Array.isArray(savedPlaylist)) {
          playlist.value = savedPlaylist.map(s => ({ ...s, missing: s.missing || false }))
        }

        if (savedSettings) {
          if (typeof savedSettings.volume === 'number') {
            volume.value = savedSettings.volume
          }
          if (savedSettings.playMode) {
            playMode.value = savedSettings.playMode
          }
          if (typeof savedSettings.fadeInDuration === 'number') {
            fadeInDuration.value = savedSettings.fadeInDuration
          }
          if (typeof savedSettings.fadeOutDuration === 'number') {
            fadeOutDuration.value = savedSettings.fadeOutDuration
          }
          if (typeof savedSettings.gainNormalization === 'boolean') {
            gainNormalization.value = savedSettings.gainNormalization
          }
        }

        if (savedHistory && Array.isArray(savedHistory)) {
          playHistory.value = savedHistory
        }

        if (savedCustomPlaylists && Array.isArray(savedCustomPlaylists)) {
          customPlaylists.value = savedCustomPlaylists
        }

        const folders = await window.electronAPI.getWatchedFolders()
        if (folders && Array.isArray(folders)) {
          watchedFolders.value = folders
          for (const folder of folders) {
            await window.electronAPI.startWatching(folder)
          }
        }

        if (playlist.value.length > 0) {
          const filePaths = playlist.value.map(s => s.filePath)
          const existMap = await window.electronAPI.checkFilesExist(filePaths)
          markMissingFiles(existMap)
        }
      } catch (e) {
        console.error('加载存储数据失败:', e)
      }
    }
  }

  function handleSongEnded() {
    if (playMode.value === 'single') {
      currentTime.value = 0
      isPlaying.value = true
    } else {
      playNext()
    }
  }

  return {
    playlist,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    volume,
    playMode,
    isMuted,
    isLoading,
    currentAudioUrl,
    playHistory,
    customPlaylists,
    activePlaylistId,
    fadeInDuration,
    fadeOutDuration,
    gainNormalization,
    watchedFolders,
    currentSong,
    activePlaylist,
    playModeText,
    playModeIcon,
    formatTime,
    isDuplicate,
    addSongs,
    addSongFromWatch,
    removeSongByPath,
    updateSongFromWatch,
    markMissingFiles,
    setPlaylist,
    reorderPlaylist,
    removeSong,
    clearPlaylist,
    addToPlayHistory,
    clearPlayHistory,
    createPlaylist,
    deletePlaylist,
    renamePlaylist,
    addSongToPlaylist,
    removeSongFromPlaylist,
    reorderPlaylistSongs,
    loadPlaylistToMain,
    playSong,
    togglePlay,
    playNext,
    playPrevious,
    togglePlayMode,
    setVolume,
    toggleMute,
    seekTo,
    setDuration,
    setCurrentTime,
    setCurrentAudioUrl,
    setLoading,
    setFadeInDuration,
    setFadeOutDuration,
    setGainNormalization,
    saveToStorage,
    saveSettings,
    loadFromStorage,
    handleSongEnded
  }
})
