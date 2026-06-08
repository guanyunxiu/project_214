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

  const currentSong = computed(() => {
    if (currentIndex.value >= 0 && currentIndex.value < playlist.value.length) {
      return playlist.value[currentIndex.value]
    }
    return null
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

  function addSongs(songs) {
    const existingIds = new Set(playlist.value.map(s => s.id))
    const newSongs = songs.filter(s => !existingIds.has(s.id))
    playlist.value.push(...newSongs)
    saveToStorage()
  }

  function setPlaylist(songs) {
    playlist.value = songs
    if (currentIndex.value >= songs.length) {
      currentIndex.value = songs.length > 0 ? 0 : -1
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

  function playSong(index) {
    if (index < 0 || index >= playlist.value.length) return
    const isSameSong = currentIndex.value === index
    currentIndex.value = index
    isPlaying.value = true
    currentTime.value = 0
    if (isSameSong) {
      currentAudioUrl.value = null
    }
  }

  function togglePlay() {
    if (currentIndex.value === -1 && playlist.value.length > 0) {
      currentIndex.value = 0
      isPlaying.value = true
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
    currentIndex.value = nextIndex
    isPlaying.value = true
    currentTime.value = 0
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
    currentIndex.value = prevIndex
    isPlaying.value = true
    currentTime.value = 0
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

  async function saveToStorage() {
    if (window.electronAPI) {
      await window.electronAPI.storeSet('playlist', playlist.value)
    }
  }

  async function saveSettings() {
    if (window.electronAPI) {
      await window.electronAPI.storeSet('settings', {
        volume: volume.value,
        playMode: playMode.value
      })
    }
  }

  async function loadFromStorage() {
    if (window.electronAPI) {
      try {
        const savedPlaylist = await window.electronAPI.storeGet('playlist')
        const savedSettings = await window.electronAPI.storeGet('settings')
        
        if (savedPlaylist && Array.isArray(savedPlaylist)) {
          playlist.value = savedPlaylist
        }
        
        if (savedSettings) {
          if (typeof savedSettings.volume === 'number') {
            volume.value = savedSettings.volume
          }
          if (savedSettings.playMode) {
            playMode.value = savedSettings.playMode
          }
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
    currentSong,
    playModeText,
    playModeIcon,
    formatTime,
    addSongs,
    setPlaylist,
    removeSong,
    clearPlaylist,
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
    loadFromStorage,
    handleSongEnded
  }
})
