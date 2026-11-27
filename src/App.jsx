import { useState } from 'react'
import { ChevronLeft, ChevronRight, Disc3 } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import AlbumRack from './components/AlbumRack'
import { playlist } from './data/playlist'
import './styles/App.css'

function updateGlassReflection(event) {
  if (event.pointerType !== 'mouse') return

  const bounds = event.currentTarget.getBoundingClientRect()
  const x = ((event.clientX - bounds.left) / bounds.width) * 100
  const y = ((event.clientY - bounds.top) / bounds.height) * 100
  event.currentTarget.style.setProperty('--light-x', `${x}%`)
  event.currentTarget.style.setProperty('--light-y', `${y}%`)
}

function App() {
  const [activeTrack, setActiveTrack] = useState(playlist[0])
  const [navigationIndex, setNavigationIndex] = useState(null)
  const reduceMotion = useReducedMotion()
  const progress = (activeTrack.id / playlist.length) * 100

  const navigateTrack = (direction) => {
    const index =
      (activeTrack.id - 1 + direction + playlist.length) % playlist.length
    setActiveTrack(playlist[index])
    setNavigationIndex(index)
  }

  return (
    <main className="record-room">
      <header
        className="glass-panel masthead"
        onPointerMove={updateGlassReflection}
      >
        <a
          className="wordmark"
          href={import.meta.env.BASE_URL}
          aria-label="RECORD ROOM 홈"
        >
          <span className="brand-mark" aria-hidden="true">
            <Disc3 size={18} strokeWidth={1.7} />
          </span>
          <span>RECORD ROOM</span>
        </a>
        <div className="collection-count" aria-label="24장의 레코드">
          <span className="collection-label">COLLECTION</span>
          <strong>24</strong>
          <span className="collection-unit">RECORDS</span>
        </div>
      </header>

      <section className="listening-room" aria-label="LP 진열대">
        <AlbumRack
          tracks={playlist}
          navigationIndex={navigationIndex}
          onActiveTrackChange={setActiveTrack}
        />
      </section>

      <footer
        className="glass-panel now-showing"
        onPointerMove={updateGlassReflection}
      >
        <div className="track-details" aria-live="polite">
          <span className="track-index">
            {String(activeTrack.id).padStart(2, '0')}
          </span>
          <div className="track-copy">
            <span className="track-eyebrow">NOW IN VIEW</span>
            <span className="track-title">{activeTrack.title}</span>
            <span className="track-artist">{activeTrack.artist}</span>
          </div>
        </div>

        <div
          className="track-progress"
          role="progressbar"
          aria-label="컬렉션 내 현재 위치"
          aria-valuemin={1}
          aria-valuemax={playlist.length}
          aria-valuenow={activeTrack.id}
        >
          <span style={{ width: `${progress}%` }} />
        </div>

        <div className="track-actions">
          <span className="track-total">24</span>
          <motion.button
            className="track-button"
            type="button"
            aria-label="이전 앨범"
            onClick={() => navigateTrack(-1)}
            whileTap={reduceMotion ? undefined : { scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
          >
            <ChevronLeft size={17} strokeWidth={2} />
          </motion.button>
          <motion.button
            className="track-button"
            type="button"
            aria-label="다음 앨범"
            onClick={() => navigateTrack(1)}
            whileTap={reduceMotion ? undefined : { scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
          >
            <ChevronRight size={17} strokeWidth={2} />
          </motion.button>
        </div>
      </footer>
    </main>
  )
}

export default App
