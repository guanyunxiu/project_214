<template>
  <div class="app-container">
    <audio
      ref="audioRef"
      :src="playerStore.currentAudioUrl"
      :volume="playerStore.isMuted ? 0 : playerStore.volume"
      @timeupdate="onTimeUpdate"
      @loadedmetadata="onLoadedMetadata"
      @ended="onEnded"
      @play="onPlay"
      @pause="onPause"
      @error="onError"
    />

    <div class="main-content">
      <div class="left-panel">
        <div class="album-cover">
          <img
            v-if="playerStore.currentSong?.cover"
            :src="playerStore.currentSong.cover"
            alt="专辑封面"
          />
          <span v-else class="default-cover">🎵</span>
        </div>

        <div class="song-info">
          <h2>{{ playerStore.currentSong?.title || '未播放' }}</h2>
          <p>{{ playerStore.currentSong?.artist || '-' }}</p>
          <p>{{ playerStore.currentSong?.album || '-' }}</p>
        </div>
      </div>

      <div class="right-panel">
        <div class="toolbar">
          <div class="toolbar-title">
            播放列表 ({{ playerStore.playlist.length }})
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
          </div>
        </div>

        <div class="song-list-container">
          <a-table
            v-if="playerStore.playlist.length > 0"
            :columns="columns"
            :data-source="playerStore.playlist"
            :pagination="false"
            :row-key="(record) => record.id"
            :row-class-name="(record, index) => index === playerStore.currentIndex ? 'playing' : ''"
            size="middle"
            @row-dblclick="(_, index) => playerStore.playSong(index)"
          >
            <template #bodyCell="{ column, record, index }">
              <template v-if="column.key === 'title'">
                <div class="song-title-cell">
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
        <button class="control-btn" @click="playerStore.playPrevious" :disabled="playerStore.playlist.length === 0" title="上一曲">
          ⏮️
        </button>
        <button class="control-btn play-btn" @click="playerStore.togglePlay" :disabled="playerStore.playlist.length === 0" :title="playerStore.isPlaying ? '暂停' : '播放'">
          {{ playerStore.isPlaying ? '⏸️' : '▶️' }}
        </button>
        <button class="control-btn" @click="playerStore.playNext" :disabled="playerStore.playlist.length === 0" title="下一曲">
          ⏭️
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
          :tooltip-formatter="(value) => `${value}%`"
          @change="handleVolumeChange"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, nextTick } from 'vue'
import { message } from 'ant-design-vue'
import { FolderOpenOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import { usePlayerStore } from './stores/player'

const playerStore = usePlayerStore()
const audioRef = ref(null)
const scanning = ref(false)
const isSeeking = ref(false)

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
    width: 180,
    ellipsis: true
  },
  {
    title: '专辑',
    dataIndex: 'album',
    key: 'album',
    width: 180,
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

watch(() => playerStore.currentSong, async (newSong) => {
  if (newSong && window.electronAPI) {
    try {
      playerStore.setLoading(true)
      const audioUrl = await window.electronAPI.readFileAsUrl(newSong.filePath)
      playerStore.setCurrentAudioUrl(audioUrl)
      await nextTick()
      if (audioRef.value && playerStore.isPlaying) {
        try {
          await audioRef.value.play()
        } catch (e) {
          console.log('自动播放被阻止或失败:', e)
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

function onEnded() {
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

function handleVolumeChange(value) {
  playerStore.setVolume(value / 100)
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
      playerStore.addSongs(result.files)
      message.success(`成功添加 ${result.files.length} 首音乐`)
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

onMounted(() => {
  playerStore.loadFromStorage()
})
</script>
