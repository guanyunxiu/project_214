<template>
  <div class="app-container">
    <audio
      ref="audioRef"
      :src="playerStore.currentAudioUrl"
      :volume="currentAudioVolume"
      @timeupdate="onTimeUpdate"
      @loadedmetadata="onLoadedMetadata"
      @ended="onEnded"
      @play="onPlay"
      @pause="onPause"
      @error="onError"
    />

    <div class="main-content">
      <div class="left-panel">
        <div class="album-cover" :class="{ 'missing-cover': playerStore.currentSong?.missing }">
          <img
            v-if="playerStore.currentSong?.cover"
            :src="playerStore.currentSong.cover"
            alt="专辑封面"
          />
          <span v-else class="default-cover">🎵</span>
          <div v-if="playerStore.currentSong?.missing" class="missing-overlay">
            <span>文件缺失</span>
          </div>
        </div>

        <div class="song-info" :class="{ 'missing-info': playerStore.currentSong?.missing }">
          <h2>{{ playerStore.currentSong?.title || '未播放' }}</h2>
          <p>{{ playerStore.currentSong?.artist || '-' }}</p>
          <p>{{ playerStore.currentSong?.album || '-' }}</p>
        </div>

        <div class="left-tabs">
          <div
            class="left-tab"
            :class="{ active: leftActiveTab === 'playlists' }"
            @click="leftActiveTab = 'playlists'"
          >
            歌单
          </div>
          <div
            class="left-tab"
            :class="{ active: leftActiveTab === 'history' }"
            @click="leftActiveTab = 'history'"
          >
            历史
          </div>
          <div
            class="left-tab"
            :class="{ active: leftActiveTab === 'settings' }"
            @click="leftActiveTab = 'settings'"
          >
            设置
          </div>
        </div>

        <div class="left-tab-content">
          <div v-if="leftActiveTab === 'playlists'" class="playlists-panel">
            <div class="playlist-actions">
              <a-button size="small" type="primary" @click="handleCreatePlaylist">
                <template #icon><PlusOutlined /></template>
                新建歌单
              </a-button>
              <a-button size="small" @click="handleImportPlaylist">
                <template #icon><ImportOutlined /></template>
                导入
              </a-button>
            </div>
            <div class="playlist-list">
              <div
                v-for="pl in playerStore.customPlaylists"
                :key="pl.id"
                class="playlist-item"
                :class="{ active: playerStore.activePlaylistId === pl.id }"
                @click="selectPlaylist(pl.id)"
              >
                <div class="playlist-item-info">
                  <span class="playlist-item-name">{{ pl.name }}</span>
                  <span class="playlist-item-count">{{ pl.songs.length }} 首</span>
                </div>
                <div class="playlist-item-actions">
                  <a-button type="text" size="small" @click.stop="handleLoadPlaylist(pl.id)">
                    <template #icon><PlayCircleOutlined /></template>
                  </a-button>
                  <a-button type="text" size="small" @click.stop="handleExportPlaylist(pl)">
                    <template #icon><ExportOutlined /></template>
                  </a-button>
                  <a-button type="text" size="small" danger @click.stop="handleDeletePlaylist(pl.id)">
                    <template #icon><DeleteOutlined /></template>
                  </a-button>
                </div>
              </div>
              <div v-if="playerStore.customPlaylists.length === 0" class="playlist-empty">
                暂无歌单
              </div>
            </div>

            <div v-if="selectedPlaylistSongs.length > 0" class="playlist-songs">
              <div class="playlist-songs-header">
                <span>{{ activePlaylistName }}</span>
              </div>
              <div
                v-for="(song, idx) in selectedPlaylistSongs"
                :key="song.filePath"
                class="playlist-song-item"
                draggable="true"
                @dragstart="onPlaylistSongDragStart($event, idx)"
                @dragover.prevent="onPlaylistSongDragOver($event, idx)"
                @drop="onPlaylistSongDrop($event, idx)"
              >
                <span class="playlist-song-title" :class="{ 'song-missing': song.missing }">
                  {{ song.title }}
                </span>
                <span class="playlist-song-artist">{{ song.artist }}</span>
                <a-button type="text" size="small" danger @click="handleRemoveSongFromPlaylist(idx)">
                  <template #icon><CloseOutlined /></template>
                </a-button>
              </div>
            </div>
          </div>

          <div v-if="leftActiveTab === 'history'" class="history-panel">
            <div class="history-header">
              <span>最近播放 ({{ playerStore.playHistory.length }})</span>
              <a-button v-if="playerStore.playHistory.length > 0" type="text" size="small" danger @click="handleClearHistory">
                清空
              </a-button>
            </div>
            <div class="history-list">
              <div
                v-for="item in playerStore.playHistory"
                :key="item.filePath + item.playedAt"
                class="history-item"
                :class="{ 'song-missing': item.missing }"
                @dblclick="handlePlayHistoryItem(item)"
              >
                <div class="history-item-info">
                  <span class="history-item-title">{{ item.title }}</span>
                  <span class="history-item-artist">{{ item.artist }}</span>
                </div>
                <span class="history-item-time">{{ formatHistoryTime(item.playedAt) }}</span>
              </div>
              <div v-if="playerStore.playHistory.length === 0" class="playlist-empty">
                暂无播放记录
              </div>
            </div>
          </div>

          <div v-if="leftActiveTab === 'settings'" class="settings-panel">
            <div class="setting-group">
              <div class="setting-label">淡入时长 (秒)</div>
              <a-slider
                :value="playerStore.fadeInDuration"
                :min="0"
                :max="5"
                :step="0.1"
                :tooltip-formatter="(v) => `${v.toFixed(1)}s`"
                @change="playerStore.setFadeInDuration"
              />
            </div>
            <div class="setting-group">
              <div class="setting-label">淡出时长 (秒)</div>
              <a-slider
                :value="playerStore.fadeOutDuration"
                :min="0"
                :max="5"
                :step="0.1"
                :tooltip-formatter="(v) => `${v.toFixed(1)}s`"
                @change="playerStore.setFadeOutDuration"
              />
            </div>
            <div class="setting-group">
              <div class="setting-label">增益归一化</div>
              <a-switch
                :checked="playerStore.gainNormalization"
                @change="playerStore.setGainNormalization"
              />
            </div>
            <div class="setting-group">
              <div class="setting-label">监控文件夹</div>
              <div class="watched-folders">
                <div v-for="folder in playerStore.watchedFolders" :key="folder" class="watched-folder-item">
                  <span class="watched-folder-path" :title="folder">{{ shortenPath(folder) }}</span>
                  <a-button type="text" size="small" danger @click="handleStopWatching(folder)">
                    <template #icon><CloseOutlined /></template>
                  </a-button>
                </div>
                <div v-if="playerStore.watchedFolders.length === 0" class="playlist-empty">
                  添加文件夹后自动监控
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="right-panel">
        <div class="toolbar">
          <div class="toolbar-title">
            播放列表 ({{ playerStore.playlist.length }})
            <span v-if="missingCount > 0" class="missing-badge">{{ missingCount }} 首缺失</span>
          </div>
          <div class="toolbar-actions">
            <a-button type="primary" @click="handleScanFolder" :loading="scanning">
              <template #icon><FolderOpenOutlined /></template>
              添加文件夹
            </a-button>
            <a-button @click="handleClearPlaylist" :disabled="playerStore.playlist.length === 0">
              <template #icon><DeleteOutlined /></template>
              清空列表
            </a-button>
            <a-button @click="handleAddToPlaylist" :disabled="playerStore.currentSong === null">
              <template #icon><PlusOutlined /></template>
              加入歌单
            </a-button>
          </div>
        </div>

        <div class="song-list-container">
          <a-table
            v-if="playerStore.playlist.length > 0"
            :columns="columns"
            :data-source="playerStore.playlist"
            :pagination="false"
            :row-key="(record) => record.id"
            :row-class-name="getRowClassName"
            size="middle"
            @row-dblclick="handleDoubleClickPlay"
            :customRow="customRow"
          >
            <template #bodyCell="{ column, record, index }">
              <template v-if="column.key === 'title'">
                <div class="song-title-cell" :class="{ 'song-missing': record.missing }">
                  <span v-if="index === playerStore.currentIndex && playerStore.isPlaying" class="playing-indicator">
                    🎵
                  </span>
                  <img
                    v-if="record.cover"
                    :src="record.cover"
                    class="mini-cover"
                  />
                  <div v-else class="mini-cover default">🎵</div>
                  <span>{{ record.title }}</span>
                  <span v-if="record.missing" class="missing-tag">缺失</span>
                </div>
              </template>
              <template v-else-if="column.key === 'duration'">
                {{ playerStore.formatTime(record.duration) }}
              </template>
              <template v-else-if="column.key === 'action'">
                <a-button
                  type="text"
                  danger
                  size="small"
                  @click.stop="playerStore.removeSong(index)"
                >
                  <template #icon><DeleteOutlined /></template>
                </a-button>
              </template>
            </template>
          </a-table>

          <div v-else class="empty-state">
            <span class="empty-icon">🎵</span>
            <p>暂无音乐，点击上方按钮添加音乐文件夹</p>
            <p style="font-size: 13px; opacity: 0.7;">支持 .mp3, .flac, .wav, .m4a, .aac, .ogg 等格式</p>
          </div>
        </div>
      </div>
    </div>

    <div class="control-panel">
      <div class="control-buttons">
        <button class="control-btn nav-btn" @click="handlePlayPrevious" :disabled="playerStore.playlist.length === 0" title="上一曲">
          <StepBackwardOutlined />
        </button>
        <button class="control-btn play-btn" @click="handleTogglePlay" :disabled="playerStore.playlist.length === 0" :title="playerStore.isPlaying ? '暂停' : '播放'">
          {{ playerStore.isPlaying ? '⏸️' : '▶️' }}
        </button>
        <button class="control-btn nav-btn" @click="handlePlayNext" :disabled="playerStore.playlist.length === 0" title="下一曲">
          <StepForwardOutlined />
        </button>
      </div>

      <div class="progress-container">
        <span class="time-display">{{ playerStore.formatTime(playerStore.currentTime) }}</span>
        <div class="progress-bar">
          <a-slider
            :value="playerStore.currentTime"
            :max="playerStore.duration || 100"
            :tooltip-formatter="(value) => playerStore.formatTime(value)"
            @change="handleSeek"
            @afterChange="handleSeekEnd"
          />
        </div>
        <span class="time-display">{{ playerStore.formatTime(playerStore.duration) }}</span>
      </div>

      <div class="play-mode-btn" @click="playerStore.togglePlayMode" :title="playerStore.playModeText">
        <span>{{ playerStore.playModeIcon }}</span>
        <span>{{ playerStore.playModeText }}</span>
      </div>

      <div class="volume-control">
        <span class="volume-icon" @click="playerStore.toggleMute">
          {{ playerStore.isMuted || playerStore.volume === 0 ? '🔇' : playerStore.volume < 0.5 ? '🔉' : '🔊' }}
        </span>
        <a-slider
          :value="playerStore.isMuted ? 0 : playerStore.volume * 100"
          :max="100"
          :step="1"
          :tooltip-formatter="(value) => `${value}%`"
          @change="handleVolumeChange"
        />
      </div>
    </div>

    <a-modal
      v-model:open="newPlaylistModalVisible"
      title="新建歌单"
      @ok="confirmCreatePlaylist"
      ok-text="创建"
      cancel-text="取消"
    >
      <a-input v-model:value="newPlaylistName" placeholder="歌单名称" @pressEnter="confirmCreatePlaylist" />
    </a-modal>

    <a-modal
      v-model:open="addToPlaylistModalVisible"
      title="添加到歌单"
      @cancel="addToPlaylistModalVisible = false"
      :footer="null"
    >
      <div class="add-to-playlist-list">
        <div
          v-for="pl in playerStore.customPlaylists"
          :key="pl.id"
          class="add-to-playlist-item"
          @click="confirmAddToPlaylist(pl.id)"
        >
          <span>{{ pl.name }}</span>
          <span class="playlist-item-count">{{ pl.songs.length }} 首</span>
        </div>
        <div v-if="playerStore.customPlaylists.length === 0" class="playlist-empty">
          请先创建歌单
        </div>
      </div>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { message } from 'ant-design-vue'
import {
  FolderOpenOutlined, DeleteOutlined, StepBackwardOutlined, StepForwardOutlined,
  PlusOutlined, ImportOutlined, ExportOutlined, PlayCircleOutlined,
  CloseOutlined
} from '@ant-design/icons-vue'
import { usePlayerStore } from './stores/player'

const playerStore = usePlayerStore()
const audioRef = ref(null)
const scanning = ref(false)
const isSeeking = ref(false)
const leftActiveTab = ref('playlists')
const newPlaylistModalVisible = ref(false)
const newPlaylistName = ref('')
const addToPlaylistModalVisible = ref(false)
const isFading = ref(false)
const dragIndex = ref(null)
const playlistDragIndex = ref(null)

const gainFactor = ref(1.0)

const currentAudioVolume = computed(() => {
  const baseVol = playerStore.isMuted ? 0 : playerStore.volume
  return Math.min(1, baseVol * gainFactor.value)
})

const missingCount = computed(() => {
  return playerStore.playlist.filter(s => s.missing).length
})

const selectedPlaylistSongs = computed(() => {
  const pl = playerStore.activePlaylist
  return pl ? pl.songs : []
})

const activePlaylistName = computed(() => {
  const pl = playerStore.activePlaylist
  return pl ? pl.name : ''
})

const columns = [
  {
    title: '#',
    dataIndex: 'index',
    key: 'index',
    width: 50,
    align: 'center',
    customRender: ({ index }) => index + 1
  },
  {
    title: '标题',
    dataIndex: 'title',
    key: 'title',
    ellipsis: true
  },
  {
    title: '艺术家',
    dataIndex: 'artist',
    key: 'artist',
    width: 150,
    ellipsis: true
  },
  {
    title: '专辑',
    dataIndex: 'album',
    key: 'album',
    width: 150,
    ellipsis: true
  },
  {
    title: '时长',
    dataIndex: 'duration',
    key: 'duration',
    width: 80,
    align: 'center'
  },
  {
    title: '操作',
    key: 'action',
    width: 60,
    align: 'center'
  }
]

let folderChangeUnsubscribe = null

function customRow(record, index) {
  return {
    draggable: true,
    onDragstart: (e) => {
      dragIndex.value = index
      e.dataTransfer.effectAllowed = 'move'
    },
    onDragover: (e) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    },
    onDrop: (e) => {
      e.preventDefault()
      const toIdx = index
      if (dragIndex.value !== null && dragIndex.value !== toIdx) {
        playerStore.reorderPlaylist(dragIndex.value, toIdx)
      }
      dragIndex.value = null
    },
    onDragend: () => {
      dragIndex.value = null
    }
  }
}

function getRowClassName(record, index) {
  let cls = index === playerStore.currentIndex ? 'playing' : ''
  if (record.missing) cls += ' missing-row'
  return cls.trim()
}

function computeGainFactor(song) {
  if (!playerStore.gainNormalization) {
    gainFactor.value = 1.0
    return
  }
  if (song && song.replayGain !== null && song.replayGain !== undefined) {
    const factor = Math.pow(10, song.replayGain / 20)
    gainFactor.value = Math.min(2.0, Math.max(0.2, factor))
  } else {
    gainFactor.value = 1.0
  }
}

async function fadeIn(audio, targetVolume, durationSec) {
  if (durationSec <= 0 || !audio) {
    audio.volume = targetVolume
    return
  }
  const steps = 20
  const stepTime = (durationSec * 1000) / steps
  const volStep = targetVolume / steps
  audio.volume = 0
  for (let i = 1; i <= steps; i++) {
    await new Promise(r => setTimeout(r, stepTime))
    if (audio.paused) break
    audio.volume = Math.min(1, volStep * i)
  }
  audio.volume = targetVolume
}

async function fadeOut(audio, durationSec) {
  if (durationSec <= 0 || !audio) {
    audio.volume = 0
    return
  }
  const steps = 20
  const stepTime = (durationSec * 1000) / steps
  const volStep = audio.volume / steps
  for (let i = 1; i <= steps; i++) {
    await new Promise(r => setTimeout(r, stepTime))
    audio.volume = Math.max(0, audio.volume - volStep)
  }
  audio.volume = 0
}

watch(() => playerStore.currentSong, async (newSong, oldSong) => {
  if (newSong && window.electronAPI) {
    try {
      playerStore.setLoading(true)
      const audioUrl = await window.electronAPI.readFileAsUrl(newSong.filePath)
      playerStore.setCurrentAudioUrl(audioUrl)
      computeGainFactor(newSong)
      await nextTick()
      if (audioRef.value && playerStore.isPlaying) {
        if (oldSong && playerStore.fadeOutDuration > 0 && !isFading.value) {
          isFading.value = true
          const targetVol = playerStore.isMuted ? 0 : playerStore.volume * gainFactor.value
          try {
            await fadeIn(audioRef.value, targetVol, playerStore.fadeInDuration)
          } catch (e) {
            audioRef.value.volume = targetVol
          }
          isFading.value = false
        } else {
          try {
            await audioRef.value.play()
          } catch (e) {
            console.log('自动播放被阻止或失败:', e)
          }
        }
      }
    } catch (error) {
      console.error('加载音频失败:', error)
      message.error('加载音频文件失败')
    } finally {
      playerStore.setLoading(false)
    }
  } else {
    playerStore.setCurrentAudioUrl(null)
  }
}, { immediate: true })

watch(() => playerStore.isPlaying, async (isPlaying) => {
  if (!audioRef.value || !playerStore.currentAudioUrl) return

  if (isPlaying) {
    try {
      await audioRef.value.play()
    } catch (e) {
      console.log('播放失败:', e)
    }
  } else {
    audioRef.value.pause()
  }
})

watch([() => playerStore.volume, () => playerStore.isMuted], ([volume, isMuted]) => {
  if (audioRef.value && !isFading.value) {
    audioRef.value.volume = isMuted ? 0 : Math.min(1, volume * gainFactor.value)
  }
})

function onTimeUpdate() {
  if (!isSeeking.value && audioRef.value) {
    playerStore.setCurrentTime(audioRef.value.currentTime)
  }
}

function onLoadedMetadata() {
  if (audioRef.value) {
    playerStore.setDuration(audioRef.value.duration)
  }
}

async function onEnded() {
  if (playerStore.fadeOutDuration > 0 && audioRef.value) {
    await fadeOut(audioRef.value, playerStore.fadeOutDuration)
  }
  playerStore.handleSongEnded()
}

function onPlay() {
  playerStore.isPlaying = true
}

function onPause() {
  playerStore.isPlaying = false
}

function onError(e) {
  console.error('音频播放错误:', e)
  message.error('音频播放出错')
}

function handleSeek(value) {
  isSeeking.value = true
  playerStore.seekTo(value)
}

function handleSeekEnd(value) {
  isSeeking.value = false
  playerStore.seekTo(value)
  if (audioRef.value) {
    audioRef.value.currentTime = value
  }
}

function handleTogglePlay() {
  playerStore.togglePlay()
}

async function handlePlayPrevious() {
  if (audioRef.value && playerStore.fadeOutDuration > 0) {
    await fadeOut(audioRef.value, playerStore.fadeOutDuration)
  }
  if (audioRef.value) {
    audioRef.value.pause()
    audioRef.value.currentTime = 0
  }
  playerStore.playPrevious()
}

async function handlePlayNext() {
  if (audioRef.value && playerStore.fadeOutDuration > 0) {
    await fadeOut(audioRef.value, playerStore.fadeOutDuration)
  }
  if (audioRef.value) {
    audioRef.value.pause()
    audioRef.value.currentTime = 0
  }
  playerStore.playNext()
}

function handleDoubleClickPlay(record, index) {
  if (record.missing) {
    message.warning('文件缺失，无法播放')
    return
  }
  if (audioRef.value) {
    audioRef.value.pause()
    audioRef.value.currentTime = 0
  }
  playerStore.playSong(index)
}

function handleVolumeChange(value) {
  playerStore.setVolume(value / 100)
  if (audioRef.value && !isFading.value) {
    audioRef.value.volume = playerStore.isMuted ? 0 : Math.min(1, playerStore.volume * gainFactor.value)
  }
}

async function handleScanFolder() {
  if (!window.electronAPI) {
    message.warning('请在 Electron 环境中运行')
    return
  }

  try {
    scanning.value = true
    const result = await window.electronAPI.selectFolder()

    if (result.success && result.files.length > 0) {
      const addedCount = playerStore.addSongs(result.files)
      if (addedCount > 0) {
        message.success(`成功添加 ${addedCount} 首音乐`)
      } else {
        message.info('所有歌曲已在播放列表中')
      }
    } else if (!result.success && result.files.length === 0) {
      message.info('未选择文件夹')
    } else if (result.files.length === 0) {
      message.warning('该文件夹中没有找到支持的音频文件')
    }
  } catch (error) {
    console.error('扫描文件夹失败:', error)
    message.error('扫描文件夹失败')
  } finally {
    scanning.value = false
  }
}

function handleClearPlaylist() {
  playerStore.clearPlaylist()
  message.success('播放列表已清空')
}

function handleCreatePlaylist() {
  newPlaylistName.value = ''
  newPlaylistModalVisible.value = true
}

function confirmCreatePlaylist() {
  const name = newPlaylistName.value.trim()
  if (!name) {
    message.warning('请输入歌单名称')
    return
  }
  playerStore.createPlaylist(name)
  newPlaylistModalVisible.value = false
  message.success(`歌单「${name}」已创建`)
}

function handleDeletePlaylist(playlistId) {
  playerStore.deletePlaylist(playlistId)
  message.success('歌单已删除')
}

function selectPlaylist(playlistId) {
  playerStore.activePlaylistId = playerStore.activePlaylistId === playlistId ? null : playlistId
}

function handleLoadPlaylist(playlistId) {
  playerStore.loadPlaylistToMain(playlistId)
  message.success('歌单已加载到播放列表')
}

function handleRemoveSongFromPlaylist(songIndex) {
  if (playerStore.activePlaylistId) {
    playerStore.removeSongFromPlaylist(playerStore.activePlaylistId, songIndex)
  }
}

function onPlaylistSongDragStart(e, idx) {
  playlistDragIndex.value = idx
  e.dataTransfer.effectAllowed = 'move'
}

function onPlaylistSongDragOver(e, idx) {
  e.preventDefault()
}

function onPlaylistSongDrop(e, toIdx) {
  e.preventDefault()
  if (playlistDragIndex.value !== null && playlistDragIndex.value !== toIdx && playerStore.activePlaylistId) {
    playerStore.reorderPlaylistSongs(playerStore.activePlaylistId, playlistDragIndex.value, toIdx)
  }
  playlistDragIndex.value = null
}

function handleAddToPlaylist() {
  if (!playerStore.currentSong) return
  if (playerStore.customPlaylists.length === 0) {
    message.info('请先创建歌单')
    return
  }
  addToPlaylistModalVisible.value = true
}

function confirmAddToPlaylist(playlistId) {
  if (playerStore.currentSong) {
    playerStore.addSongToPlaylist(playlistId, playerStore.currentSong)
    message.success('已添加到歌单')
    addToPlaylistModalVisible.value = false
  }
}

async function handleExportPlaylist(pl) {
  if (!window.electronAPI) return
  try {
    const result = await window.electronAPI.showSaveDialog({
      title: '导出歌单',
      defaultPath: `${pl.name}`,
      filters: [
        { name: 'M3U 播放列表', extensions: ['m3u'] },
        { name: 'PLIST 播放列表', extensions: ['plist'] }
      ]
    })
    if (result.canceled) return

    const filePath = result.filePath
    if (filePath.endsWith('.m3u')) {
      const res = await window.electronAPI.exportM3u(pl.songs, filePath)
      if (res.success) message.success('歌单已导出为 M3U')
      else message.error('导出失败')
    } else if (filePath.endsWith('.plist')) {
      const res = await window.electronAPI.exportPlist(pl.songs, filePath)
      if (res.success) message.success('歌单已导出为 PLIST')
      else message.error('导出失败')
    }
  } catch (e) {
    console.error('导出失败:', e)
    message.error('导出失败')
  }
}

async function handleImportPlaylist() {
  if (!window.electronAPI) return
  try {
    const result = await window.electronAPI.showOpenDialog({
      title: '导入歌单',
      filters: [
        { name: '播放列表', extensions: ['m3u', 'plist'] }
      ],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return

    const filePath = result.filePaths[0]
    let res
    if (filePath.endsWith('.m3u')) {
      res = await window.electronAPI.importM3u(filePath)
    } else if (filePath.endsWith('.plist')) {
      res = await window.electronAPI.importPlist(filePath)
    } else {
      message.warning('不支持的文件格式')
      return
    }

    if (res.success && res.files.length > 0) {
      const name = filePath.split(/[/\\]/).pop().replace(/\.(m3u|plist)$/, '')
      const pl = playerStore.createPlaylist(name)
      for (const song of res.files) {
        playerStore.addSongToPlaylist(pl.id, song)
      }
      message.success(`已导入 ${res.files.length} 首歌曲`)
    } else if (res.success && res.files.length === 0) {
      message.warning('未能从文件中导入任何歌曲')
    } else {
      message.error('导入失败: ' + (res.error || '未知错误'))
    }
  } catch (e) {
    console.error('导入失败:', e)
    message.error('导入失败')
  }
}

function handleClearHistory() {
  playerStore.clearPlayHistory()
  message.success('播放历史已清空')
}

async function handleStopWatching(folder) {
  if (window.electronAPI) {
    await window.electronAPI.stopWatching(folder)
    const folders = await window.electronAPI.getWatchedFolders()
    playerStore.watchedFolders = folders || []
    message.success('已停止监控该文件夹')
  }
}

function handlePlayHistoryItem(item) {
  const idx = playerStore.playlist.findIndex(s => s.filePath === item.filePath)
  if (idx >= 0) {
    playerStore.playSong(idx)
  } else {
    message.info('该歌曲不在当前播放列表中')
  }
}

function formatHistoryTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function shortenPath(p) {
  if (!p) return ''
  const parts = p.split('/')
  return parts.length > 3 ? '…/' + parts.slice(-2).join('/') : p
}

onMounted(async () => {
  await playerStore.loadFromStorage()

  if (window.electronAPI && window.electronAPI.onFolderChange) {
    folderChangeUnsubscribe = window.electronAPI.onFolderChange((data) => {
      if (data.type === 'add') {
        playerStore.addSongFromWatch(data.song)
        message.info(`检测到新文件: ${data.song.title}`)
      } else if (data.type === 'delete') {
        playerStore.removeSongByPath(data.filePath)
        message.info(`检测到文件删除`)
      } else if (data.type === 'modify') {
        playerStore.updateSongFromWatch(data.song)
        message.info(`检测到文件修改: ${data.song.title}`)
      }
    })
  }
})

onUnmounted(() => {
  if (folderChangeUnsubscribe) {
    folderChangeUnsubscribe()
  }
})
</script>
