import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Disc3,
  ListMusic,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import Turntable from './Turntable'
import VinylRecord from './VinylRecord'
import '../styles/ListeningRoom.css'

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const wholeSeconds = Math.floor(seconds)
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`
}

function getAudioUrl(track) {
  const fileName = `${String(track.id).padStart(2, '0')}.m4a`
  return `${import.meta.env.BASE_URL}audio/${fileName}`
}

function getArtworkUrl(track) {
  const imagePath = track.artwork?.imageUrl
  if (!imagePath) return null
  return imagePath.startsWith('http')
    ? imagePath
    : `${import.meta.env.BASE_URL}${imagePath.replace(/^\/+/, '')}`
}

function ListeningRoom({
  track,
  originRect,
  originYaw,
  onRevealCollection,
  onBack,
  volume,
  isMuted,
  onVolumeChange,
  onMutedChange,
  onToggleMute,
}) {
  const jacketAnchorRef = useRef(null)
  const turntableRef = useRef(null)
  const audioRef = useRef(null)
  const controlsRef = useRef(null)
  const hideTimerRef = useRef(0)
  const pointerInsideRef = useRef(false)
  const focusedRef = useRef(false)
  const interactingRef = useRef(false)
  const audioFadeFrameRef = useRef(0)
  const playAttemptRef = useRef(0)
  const pendingSeekRef = useRef(null)
  const [positions, setPositions] = useState(null)
  const [phase, setPhase] = useState('jacket')
  const [returnRequested, setReturnRequested] = useState(false)
  const [recordRotation, setRecordRotation] = useState(0)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const [isTonearmOnRecord, setIsTonearmOnRecord] = useState(false)
  const [isManualSpinPaused, setIsManualSpinPaused] = useState(false)
  const [hasStartedPlayback, setHasStartedPlayback] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [controlsVisible, setControlsVisible] = useState(false)
  const [isInteracting, setIsInteracting] = useState(false)
  const [tonearmSeek, setTonearmSeek] = useState({ progress: 0, revision: 0 })
  const [audioError, setAudioError] = useState(false)
  const [armReturnRequested, setArmReturnRequested] = useState(false)
  const reduceMotion = useReducedMotion()
  const artworkUrl = getArtworkUrl(track)
  const audioUrl = getAudioUrl(track)
  const albumTitle = track.artwork?.albumTitle || track.title
  const isManualSpinActive =
    isTonearmOnRecord && !isManualSpinPaused
  const shortTransition = reduceMotion ? 0.38 : 1.08
  const returnLiftTransition = reduceMotion ? 0.12 : 0.22
  const returnMoveTransition = reduceMotion ? 0.35 : 0.9
  const returnInsertTransition = reduceMotion ? 0.32 : 0.8
  const returnFadeTransition = reduceMotion ? 0.15 : 0.5

  useEffect(() => () => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    if (audioFadeFrameRef.current) {
      window.cancelAnimationFrame(audioFadeFrameRef.current)
    }

    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (audio) audio.volume = isMuted ? 0 : volume
  }, [volume, isMuted])

  const showControls = useCallback(() => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = 0
    }
    setControlsVisible(true)
  }, [])

  const scheduleControlsHide = useCallback(() => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    if (
      pointerInsideRef.current ||
      focusedRef.current ||
      interactingRef.current
    ) {
      return
    }
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = 0
      if (
        !pointerInsideRef.current &&
        !focusedRef.current &&
        !interactingRef.current
      ) {
        setControlsVisible(false)
      }
    }, 2000)
  }, [])

  useEffect(() => {
    const handlePointerMove = (event) => {
      const inBottomZone = event.clientY >= window.innerHeight - 100
      const overControls = Boolean(
        controlsRef.current?.contains(event.target),
      )
      if (inBottomZone || overControls) {
        showControls()
      } else if (controlsVisible) {
        scheduleControlsHide()
      }
    }
    const handlePointerDown = (event) => {
      if (
        event.pointerType === 'touch' &&
        event.clientY >= window.innerHeight - 100
      ) {
        showControls()
      }
    }
    const handlePointerUp = (event) => {
      if (event.pointerType === 'touch') scheduleControlsHide()
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [controlsVisible, scheduleControlsHide, showControls])

  const setControlInteraction = (active) => {
    interactingRef.current = active
    setIsInteracting(active)
    if (active) showControls()
    else scheduleControlsHide()
  }

  const updateTonearmPosition = (progress) => {
    setTonearmSeek((previous) => ({
      progress,
      revision: previous.revision + 1,
    }))
  }

  const playFromProgress = useCallback((progress) => {
    const audio = audioRef.current
    if (!audio) return

    const attempt = ++playAttemptRef.current
    const normalizedProgress = Math.max(0, Math.min(1, progress))
    setArmReturnRequested(false)
    pendingSeekRef.current = normalizedProgress
    setAudioError(false)

    if (
      audio.readyState >= 1 &&
      Number.isFinite(audio.duration) &&
      audio.duration > 0
    ) {
      audio.currentTime = audio.duration * normalizedProgress
      pendingSeekRef.current = null
    }

    try {
      const playRequest = audio.play()
      playRequest?.catch(() => {
        if (playAttemptRef.current !== attempt) return
        pendingSeekRef.current = null
        setIsAudioPlaying(false)
        setAudioError(true)
      })
    } catch {
      pendingSeekRef.current = null
      setIsAudioPlaying(false)
      setAudioError(true)
    }
  }, [])

  const togglePlayback = () => {
    const audio = audioRef.current
    if (!audio) {
      if (isTonearmOnRecord) {
        setIsManualSpinPaused(isManualSpinActive)
      }
      return
    }

    if (!audio.paused || isManualSpinActive) {
      playAttemptRef.current += 1
      pendingSeekRef.current = null
      setIsManualSpinPaused(true)
      audio.pause()
      return
    }

    setIsManualSpinPaused(false)
    setArmReturnRequested(false)
    const attempt = ++playAttemptRef.current
    setAudioError(false)
    try {
      audio.play()?.catch(() => {
        if (playAttemptRef.current !== attempt) return
        setIsAudioPlaying(false)
        setAudioError(true)
      })
    } catch {
      setIsAudioPlaying(false)
      setAudioError(true)
    }
  }

  const seekToProgress = (progress, syncTonearm = true) => {
    const normalized = Math.max(0, Math.min(1, progress))
    const audio = audioRef.current
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = audio.duration * normalized
      setCurrentTime(audio.currentTime)
    }
    if (syncTonearm) updateTonearmPosition(normalized)
  }

  const syncAudioMetadata = useCallback(() => {
    const audio = audioRef.current
    if (
      !audio ||
      !Number.isFinite(audio.duration) ||
      audio.duration <= 0
    ) {
      return
    }

    setDuration(audio.duration)
    const pendingProgress = pendingSeekRef.current
    if (pendingProgress === null) return
    audio.currentTime = audio.duration * pendingProgress
    setCurrentTime(audio.currentTime)
    pendingSeekRef.current = null
  }, [])

  const handleTonearmDragStart = () => {
    playAttemptRef.current += 1
    setArmReturnRequested(false)
    setIsManualSpinPaused(false)
    pendingSeekRef.current = null
    if (audioRef.current && Number.isFinite(audioRef.current.duration)) {
      setCurrentTime(audioRef.current.currentTime)
      updateTonearmPosition(
        audioRef.current.duration > 0
          ? audioRef.current.currentTime / audioRef.current.duration
          : 0,
      )
    }
    audioRef.current?.pause()
  }

  const handleTonearmProgressChange = (progress) => {
    const audio = audioRef.current
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      setCurrentTime(audio.duration * progress)
    }
  }

  const handleTonearmRelease = ({ onRecord, progress }) => {
    if (!onRecord) {
      seekToProgress(progress, false)
      audioRef.current?.pause()
      return
    }

    setIsManualSpinPaused(false)
    seekToProgress(progress)
    if (audioUrl) playFromProgress(progress)
  }

  const handleAudioEnded = () => {
    const audio = audioRef.current
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      setCurrentTime(audio.duration)
    }
    setIsAudioPlaying(false)
    setIsManualSpinPaused(true)
    setArmReturnRequested(false)
  }

  const stopAudioForReturn = useCallback(() => {
    const audio = audioRef.current
    setIsManualSpinPaused(true)
    playAttemptRef.current += 1
    pendingSeekRef.current = null
    if (!audio) return

    if (audioFadeFrameRef.current) {
      window.cancelAnimationFrame(audioFadeFrameRef.current)
      audioFadeFrameRef.current = 0
    }

    const startingVolume = audio.volume
    if (audio.paused || startingVolume === 0) {
      audio.pause()
      audio.currentTime = 0
      setIsAudioPlaying(false)
      return
    }

    const fadeStartedAt = performance.now()
    const fadeDuration = 180
    const fadeOut = (now) => {
      const progress = Math.min((now - fadeStartedAt) / fadeDuration, 1)
      audio.volume = startingVolume * (1 - progress)

      if (progress < 1) {
        audioFadeFrameRef.current = window.requestAnimationFrame(fadeOut)
        return
      }

      audioFadeFrameRef.current = 0
      audio.pause()
      audio.currentTime = 0
      audio.volume = startingVolume
      setIsAudioPlaying(false)
    }

    audioFadeFrameRef.current = window.requestAnimationFrame(fadeOut)
  }, [])

  const measurePositions = useCallback(() => {
    const jacketBounds = jacketAnchorRef.current?.getBoundingClientRect()
    const recordBounds = turntableRef.current
      ?.querySelector('.platter-vinyl')
      ?.getBoundingClientRect()
    if (!jacketBounds || !recordBounds) {
      console.error('Unable to measure the album jacket or turntable platter.')
      return null
    }

    const jacket = {
      x: jacketBounds.left,
      y: jacketBounds.top,
      width: jacketBounds.width,
      height: jacketBounds.height,
    }
    const diameter = Math.min(jacket.width * 0.82, 188)
    const lifted = {
      x: recordBounds.left - recordBounds.width * 0.012,
      y: recordBounds.top - recordBounds.height * 0.035,
      width: recordBounds.width * 1.024,
      height: recordBounds.height * 1.024,
    }
    const extracted = {
      x: jacket.x + jacket.width + 14,
      y: jacket.y + (jacket.height - diameter) / 2,
      width: diameter,
      height: diameter,
    }
    return {
      origin: originRect,
      originYaw,
      jacket,
      record: {
        x: recordBounds.left,
        y: recordBounds.top,
        width: recordBounds.width,
        height: recordBounds.height,
      },
      lifted,
      diameter,
      inserted: {
        x: jacket.x + (jacket.width - diameter) / 2,
        y: jacket.y + (jacket.height - diameter) / 2,
        width: diameter,
        height: diameter,
      },
      extracted,
    }
  }, [originRect, originYaw])

  useLayoutEffect(() => {
    setPositions(measurePositions())
  }, [measurePositions])

  const jacketOnScreen =
    positions &&
    (phase === 'jacket' ||
      phase === 'extract' ||
      phase === 'transport' ||
      phase === 'returnJacket' ||
      phase === 'returnFade')
  const jacketIsReturning =
    phase === 'returnJacket' || phase === 'returnFade'
  const recordIsFlying =
    positions &&
    [
      'extract',
      'transport',
      'returnLift',
      'returnExtract',
      'returnInsert',
    ].includes(phase)
  const recordTransitionDuration =
    phase === 'returnLift'
      ? returnLiftTransition
      : phase === 'returnExtract'
        ? returnMoveTransition
        : phase === 'returnInsert'
          ? returnInsertTransition
          : phase === 'extract'
            ? shortTransition * 0.82
            : shortTransition
  const anchorIsVisible =
    phase === 'listening' ||
    phase === 'returnArm' ||
    phase === 'returnLift' ||
    phase === 'returnExtract' ||
    phase === 'returnInsert'
  const jacketTarget = jacketIsReturning ? positions?.origin : positions?.jacket

  const handleJacketAnimationComplete = () => {
    if (phase === 'jacket') setPhase('extract')
    if (phase === 'returnJacket') {
      onRevealCollection()
      setPhase('returnFade')
    }
  }

  const handleRecordAnimationComplete = () => {
    if (phase === 'extract') setPhase('transport')
    if (phase === 'transport') setPhase('listening')
    if (phase === 'returnLift') setPhase('returnExtract')
    if (phase === 'returnExtract') setPhase('returnInsert')
    if (phase === 'returnInsert') setPhase('returnJacket')
  }

  const handleReturnReady = (rotation) => {
    const currentPositions = measurePositions()
    if (!currentPositions) return

    setPositions(currentPositions)
    setRecordRotation(rotation)
    setPhase('returnLift')
  }

  const handleScreenAnimationComplete = () => {
    if (phase === 'returnFade') onBack()
  }

  const handleBack = () => {
    if (phase !== 'listening') return
    stopAudioForReturn()
    setPhase('returnArm')
    setReturnRequested(true)
  }

  return (
    <motion.main
      className="listening-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: phase === 'returnFade' ? 0 : 1 }}
      transition={{
        duration: phase === 'returnFade'
          ? returnFadeTransition
          : reduceMotion
            ? 0.15
            : 0.5,
        ease: 'easeOut',
      }}
      onAnimationComplete={handleScreenAnimationComplete}
      aria-label={`${track.title} LP 감상 화면`}
    >
      <header className="listening-header">
        <button
          className="listening-back"
          type="button"
          onClick={handleBack}
          disabled={phase !== 'listening'}
          aria-label="앨범 보관함으로 돌아가기"
        >
          <ArrowLeft size={17} strokeWidth={1.8} />
          <span>보관함</span>
        </button>
        <div className="listening-wordmark">
          <Disc3 size={16} strokeWidth={1.7} aria-hidden="true" />
          <span>RECORD ROOM</span>
        </div>
        <span className="listening-index">
          {String(track.id).padStart(2, '0')} <span>/ 24</span>
        </span>
      </header>

      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          hidden
          aria-hidden="true"
          tabIndex={-1}
          onLoadedMetadata={syncAudioMetadata}
          onDurationChange={syncAudioMetadata}
          onTimeUpdate={() => {
            const audio = audioRef.current
            if (audio) setCurrentTime(audio.currentTime)
          }}
          onSeeked={() => {
            const audio = audioRef.current
            if (audio) setCurrentTime(audio.currentTime)
          }}
          onPlaying={() => {
            setIsAudioPlaying(true)
            setHasStartedPlayback(true)
            setAudioError(false)
          }}
          onPause={() => {
            if (audioRef.current?.paused) {
              setIsAudioPlaying(false)
              setCurrentTime(audioRef.current.currentTime)
            }
          }}
          onEnded={handleAudioEnded}
          onError={() => {
            pendingSeekRef.current = null
            setIsAudioPlaying(false)
            setAudioError(true)
          }}
          onVolumeChange={() => {
            const audio = audioRef.current
            if (audio && !isMuted) onVolumeChange(audio.volume)
          }}
        />
      )}

      <div className="listening-content">
        <section className="album-showcase" aria-label="선택한 앨범">
          <div
            className={`listening-jacket-anchor${anchorIsVisible ? ' is-visible' : ''}`}
            ref={jacketAnchorRef}
          >
            {artworkUrl ? (
              <img src={artworkUrl} alt={`${albumTitle} 앨범 커버`} draggable="false" />
            ) : (
              <span className="jacket-placeholder">
                <Disc3 size={42} strokeWidth={1} />
              </span>
            )}
            <span className="jacket-anchor-gloss" aria-hidden="true" />
          </div>
          <div className="album-copy">
            <span className="album-kicker">NOW ON THE DECK</span>
            <h1>{track.title}</h1>
            <p>{track.artist}</p>
            <span className="album-release">{albumTitle}</span>
          </div>
        </section>

        <section className="turntable-column" aria-label="LP 턴테이블">
          <Turntable
            coverUrl={artworkUrl}
            albumTitle={albumTitle}
            showRecord={phase === 'listening' || phase === 'returnArm'}
            returnRequested={returnRequested}
            armReturnRequested={armReturnRequested}
            audioRef={audioRef}
            hasAudio={Boolean(audioUrl)}
            isAudioPlaying={isAudioPlaying}
            hasStartedPlayback={hasStartedPlayback}
            audioError={audioError}
            tonearmSeek={tonearmSeek}
            isManualSpinPaused={isManualSpinPaused}
            onTonearmRecordChange={setIsTonearmOnRecord}
            onTonearmDragStart={handleTonearmDragStart}
            onTonearmProgressChange={handleTonearmProgressChange}
            onTonearmRelease={handleTonearmRelease}
            onReturnReady={handleReturnReady}
            turntableRef={turntableRef}
          />
          <p className="tonearm-hint">
            톤암을 잡아 LP 위로 옮기면 레코드가 회전합니다
          </p>
        </section>
      </div>

      <div
        className={`playback-controls${controlsVisible && phase === 'listening' ? ' is-visible' : ''}${isInteracting ? ' is-interacting' : ''}`}
        ref={controlsRef}
        aria-label="재생 컨트롤"
        aria-hidden={!controlsVisible || phase !== 'listening'}
        inert={!controlsVisible || phase !== 'listening'}
        onPointerEnter={() => {
          pointerInsideRef.current = true
          showControls()
        }}
        onPointerLeave={() => {
          pointerInsideRef.current = false
          scheduleControlsHide()
        }}
        onFocus={() => {
          focusedRef.current = true
          showControls()
        }}
        onBlur={(event) => {
          if (event.currentTarget.contains(event.relatedTarget)) return
          focusedRef.current = false
          scheduleControlsHide()
        }}
        onKeyDown={showControls}
        onPointerDown={(event) => {
          if (event.target instanceof HTMLInputElement) {
            setControlInteraction(true)
          }
        }}
        onPointerUp={() => setControlInteraction(false)}
        onPointerCancel={() => setControlInteraction(false)}
      >
        <button
          className="playback-icon-button playback-toggle"
          type="button"
          aria-label={isAudioPlaying || isManualSpinActive ? '일시 정지' : '재생'}
          onClick={togglePlayback}
          disabled={(!audioUrl && !isTonearmOnRecord) || phase !== 'listening'}
        >
          {isAudioPlaying || isManualSpinActive
            ? <Pause size={17} strokeWidth={1.8} />
            : <Play size={17} strokeWidth={1.8} />}
        </button>
        <span className="playback-time">{formatTime(currentTime)}</span>
        <input
          className="playback-range playback-progress"
          type="range"
          min="0"
          max={duration || 0}
          step="0.1"
          value={Math.min(currentTime, duration || 0)}
          aria-label="재생 위치"
          disabled={!duration}
          style={{
            '--range-progress': `${duration ? (currentTime / duration) * 100 : 0}%`,
          }}
          onChange={(event) => {
            const nextTime = Number(event.target.value)
            seekToProgress(duration ? nextTime / duration : 0)
          }}
        />
        <span className="playback-time">{formatTime(duration)}</span>
        <button
          className="playback-icon-button playback-volume-toggle"
          type="button"
          aria-label={isMuted || volume === 0 ? '음소거 해제' : '음소거'}
          onClick={onToggleMute}
        >
          {isMuted || volume === 0
            ? <VolumeX size={17} strokeWidth={1.7} />
            : <Volume2 size={17} strokeWidth={1.7} />}
        </button>
        <input
          className="playback-range playback-volume"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={isMuted ? 0 : volume}
          aria-label="볼륨"
          style={{
            '--range-progress': `${(isMuted ? 0 : volume) * 100}%`,
          }}
          onChange={(event) => {
            onVolumeChange(Number(event.target.value))
            onMutedChange(false)
          }}
        />
        <button
          className="playback-icon-button playback-playlist"
          type="button"
          aria-label="플레이리스트 (준비 중)"
          title="준비 중"
          disabled
        >
          <ListMusic size={17} strokeWidth={1.7} />
        </button>
      </div>

      {positions && jacketOnScreen && (
        <motion.div
          className="album-jacket-flight"
          initial={
            jacketIsReturning
              ? {
                  x: positions.jacket.x,
                  y: positions.jacket.y,
                  width: positions.jacket.width,
                  height: positions.jacket.height,
                  rotateY: 0,
                }
              : {
                  x: positions.origin.left,
                  y: positions.origin.top,
                  width: positions.origin.width,
                  height: positions.origin.height,
                  rotateY: positions.originYaw,
                }
          }
          animate={{
            x: jacketTarget.x,
            y: jacketTarget.y,
            width: jacketTarget.width,
            height: jacketTarget.height,
            rotateY: jacketIsReturning
              ? [0, 0, positions.originYaw]
              : [positions.originYaw, positions.originYaw, 0],
          }}
          transition={{
            duration: shortTransition,
            ease: [0.22, 0.72, 0.24, 1],
            rotateY: {
              duration: shortTransition,
              times: jacketIsReturning ? [0, 0.78, 1] : [0, 0.56, 1],
              ease: 'easeInOut',
            },
          }}
          onAnimationComplete={handleJacketAnimationComplete}
          style={{ transformPerspective: 1200, zIndex: 60 }}
          aria-hidden="true"
        >
          <span className="album-jacket-front">
            {artworkUrl && <img src={artworkUrl} alt="" draggable="false" />}
            <span className="album-jacket-shrink-wrap" />
          </span>
          <span className="album-jacket-edge" />
        </motion.div>
      )}

      {positions && recordIsFlying && (
        <motion.div
          className={`record-flight${phase === 'extract' || phase === 'returnInsert' ? ' is-sleeved' : ''}${phase === 'returnLift' ? ' is-lifted' : ''}`}
          initial={phase === 'extract' ? positions.inserted : positions.record}
          animate={
            phase === 'extract'
              ? positions.extracted
              : phase === 'transport'
                ? positions.record
                : phase === 'returnLift'
                  ? positions.lifted
                  : phase === 'returnExtract'
                    ? positions.extracted
                    : positions.inserted
          }
          transition={{
            duration: recordTransitionDuration,
            ease: [0.2, 0.72, 0.2, 1],
          }}
          onAnimationComplete={handleRecordAnimationComplete}
          style={{
            zIndex: phase === 'extract' || phase === 'returnInsert' ? 45 : 70,
            '--record-flight-rotation': `${recordRotation}deg`,
          }}
          aria-hidden="true"
        >
          <VinylRecord
            coverUrl={artworkUrl}
            albumTitle={albumTitle}
            className="vinyl-record--flight"
          />
        </motion.div>
      )}
    </motion.main>
  )
}

export default ListeningRoom
