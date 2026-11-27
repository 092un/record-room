import { useCallback, useEffect, useRef, useState } from 'react'
import VinylRecord from './VinylRecord'
import '../styles/Turntable.css'

const PIVOT_X = 710
const PIVOT_Y = 78
const NEEDLE_X = 350
const NEEDLE_Y = 94
const ARM_LENGTH = Math.hypot(PIVOT_X - NEEDLE_X, NEEDLE_Y - PIVOT_Y)
const ARM_BASE_ANGLE =
  (Math.atan2(NEEDLE_Y - PIVOT_Y, NEEDLE_X - PIVOT_X) * 180) / Math.PI
const PLATTER_X = 340
const PLATTER_Y = 300
const INITIAL_ANGLE = 100
const MIN_ANGLE = 100
const MAX_ANGLE = 151
const RECORD_OUTER_RADIUS = 205
const RECORD_INNER_RADIUS = 74
const RPM_DEGREES_PER_SECOND = 200
const SPIN_RESPONSE_MS = 440
const RETURN_SPIN_DECEL_MS = 150
const RETURN_LIFT_DELAY_MS = 90

function getNeedleDistance(angle) {
  const radians = (angle * Math.PI) / 180
  const needleX = PIVOT_X + ARM_LENGTH * Math.cos(radians)
  const needleY = PIVOT_Y + ARM_LENGTH * Math.sin(radians)
  return Math.hypot(needleX - PLATTER_X, needleY - PLATTER_Y)
}

function getPlaybackProgress(angle) {
  return Math.max(
    0,
    Math.min(
      1,
      (RECORD_OUTER_RADIUS - getNeedleDistance(angle)) /
        (RECORD_OUTER_RADIUS - RECORD_INNER_RADIUS),
    ),
  )
}

function getAngleForPlaybackProgress(progress) {
  const normalizedProgress = Math.max(0, Math.min(1, progress))
  const targetDistance =
    RECORD_OUTER_RADIUS -
    normalizedProgress * (RECORD_OUTER_RADIUS - RECORD_INNER_RADIUS)
  let lowerAngle = MIN_ANGLE
  let upperAngle = MAX_ANGLE

  for (let step = 0; step < 20; step += 1) {
    const middleAngle = (lowerAngle + upperAngle) / 2
    if (getNeedleDistance(middleAngle) > targetDistance) {
      lowerAngle = middleAngle
    } else {
      upperAngle = middleAngle
    }
  }

  return (lowerAngle + upperAngle) / 2
}

function Turntable({
  coverUrl,
  albumTitle,
  showRecord,
  returnRequested,
  armReturnRequested,
  audioRef,
  hasAudio,
  isAudioPlaying,
  hasStartedPlayback,
  audioError,
  tonearmSeek,
  onTonearmDragStart,
  onTonearmProgressChange,
  onTonearmRelease,
  onReturnReady,
  turntableRef,
}) {
  const armRef = useRef(null)
  const recordRef = useRef(null)
  const frameRef = useRef(0)
  const onReturnReadyRef = useRef(onReturnReady)
  const onTonearmProgressChangeRef = useRef(onTonearmProgressChange)
  const isAudioPlayingRef = useRef(isAudioPlaying)
  const stateRef = useRef({
    angle: INITIAL_ANGLE,
    targetAngle: INITIAL_ANGLE,
    rotation: 0,
    speed: 0,
    lastTime: 0,
    pointerId: null,
    onRecord: false,
    isReturning: false,
    isArmReturning: false,
    armReturned: false,
    returnNotified: false,
    lastReportedProgress: null,
  })
  const returnLiftTimerRef = useRef(0)
  const [isOnRecord, setIsOnRecord] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    onReturnReadyRef.current = onReturnReady
  }, [onReturnReady])

  useEffect(() => {
    onTonearmProgressChangeRef.current = onTonearmProgressChange
  }, [onTonearmProgressChange])

  const animateFrame = useCallback(function updateTurntable(time) {
    frameRef.current = 0
    const state = stateRef.current
    const audioPlaying = isAudioPlayingRef.current
    const audio = audioRef.current

    if (
      hasAudio &&
      audioPlaying &&
      audio &&
      state.pointerId === null &&
      !state.isReturning &&
      !state.isArmReturning &&
      Number.isFinite(audio.duration) &&
      audio.duration > 0
    ) {
      state.targetAngle = getAngleForPlaybackProgress(
        audio.currentTime / audio.duration,
      )
    }

    if (!state.lastTime) state.lastTime = time
    const elapsed = Math.min(time - state.lastTime, 40)
    state.lastTime = time

    const blend = 1 - Math.exp(-elapsed / 76)
    state.angle += (state.targetAngle - state.angle) * blend
    if (Math.abs(state.targetAngle - state.angle) < 0.035) {
      state.angle = state.targetAngle
    }
    if (state.pointerId !== null) {
      const progress = getPlaybackProgress(state.angle)
      if (
        state.lastReportedProgress === null ||
        Math.abs(progress - state.lastReportedProgress) >= 0.003
      ) {
        state.lastReportedProgress = progress
        onTonearmProgressChangeRef.current?.(progress)
      }
    }

    if (armRef.current) {
      armRef.current.setAttribute(
        'transform',
        `rotate(${state.angle - ARM_BASE_ANGLE} ${PIVOT_X} ${PIVOT_Y})`,
      )
    }

    if (
      (state.isReturning || state.isArmReturning) &&
      !state.armReturned &&
      Math.abs(state.angle - MIN_ANGLE) < 0.08
    ) {
      state.armReturned = true
      state.isArmReturning = false
      armRef.current?.classList.remove('is-return-lifted')
    }

    const radians = (state.angle * Math.PI) / 180
    const needleX = PIVOT_X + ARM_LENGTH * Math.cos(radians)
    const needleY = PIVOT_Y + ARM_LENGTH * Math.sin(radians)
    const distance = Math.hypot(needleX - PLATTER_X, needleY - PLATTER_Y)
    const wasOnRecord = state.onRecord
    state.onRecord = wasOnRecord
      ? distance <= RECORD_OUTER_RADIUS + 9 &&
        distance >= RECORD_INNER_RADIUS - 9
      : distance <= RECORD_OUTER_RADIUS - 5 &&
        distance >= RECORD_INNER_RADIUS + 5

    if (state.onRecord !== wasOnRecord) {
      setIsOnRecord(state.onRecord)
    }

    const shouldSpin = hasAudio
      ? audioPlaying || (state.pointerId !== null && state.onRecord)
      : state.onRecord
    const targetSpeed = shouldSpin ? RPM_DEGREES_PER_SECOND : 0
    const responseTime =
      state.isReturning && !state.onRecord
        ? RETURN_SPIN_DECEL_MS
        : SPIN_RESPONSE_MS
    state.speed +=
      (targetSpeed - state.speed) * (1 - Math.exp(-elapsed / responseTime))
    if (state.isReturning && !state.onRecord && state.speed < 0.15) {
      state.speed = 0
    }
    state.rotation = (state.rotation + (state.speed * elapsed) / 1000) % 360
    if (recordRef.current) {
      recordRef.current.style.transform = `rotate(${state.rotation}deg)`
    }

    if (
      state.isReturning &&
      !state.returnNotified &&
      Math.abs(state.angle - MIN_ANGLE) < 0.08 &&
      state.speed < 0.15
    ) {
      state.returnNotified = true
      onReturnReadyRef.current?.(state.rotation)
    }

    const shouldContinue =
      state.pointerId !== null ||
      Math.abs(state.targetAngle - state.angle) > 0.035 ||
      Math.abs(targetSpeed - state.speed) > 0.15 ||
      (hasAudio &&
        audioPlaying &&
        state.pointerId === null &&
        !state.isReturning &&
        !state.isArmReturning)
    state.lastTime = shouldContinue ? time : 0
    if (shouldContinue) {
      frameRef.current = window.requestAnimationFrame(updateTurntable)
    }
  }, [audioRef, hasAudio])

  const scheduleFrame = useCallback(() => {
    if (!frameRef.current) {
      frameRef.current = window.requestAnimationFrame(animateFrame)
    }
  }, [animateFrame])

  useEffect(() => {
    isAudioPlayingRef.current = isAudioPlaying
    if (isAudioPlaying) scheduleFrame()
  }, [isAudioPlaying, scheduleFrame])

  useEffect(() => {
    const state = stateRef.current
    if (tonearmSeek.revision === 0 || state.pointerId !== null) return
    state.targetAngle = getAngleForPlaybackProgress(tonearmSeek.progress)
    scheduleFrame()
  }, [tonearmSeek, scheduleFrame])

  useEffect(() => {
    if (!returnRequested) return

    const state = stateRef.current
    if (returnLiftTimerRef.current) {
      window.clearTimeout(returnLiftTimerRef.current)
      returnLiftTimerRef.current = 0
    }
    state.isReturning = true
    state.isArmReturning = false
    state.returnNotified = false
    state.armReturned = Math.abs(state.angle - MIN_ANGLE) < 0.08

    if (state.armReturned) {
      state.targetAngle = MIN_ANGLE
      if (state.speed < 0.15) {
        state.returnNotified = true
        onReturnReadyRef.current?.(state.rotation)
        return
      }
      scheduleFrame()
      return
    }

    armRef.current?.classList.add('is-return-lifted')
    returnLiftTimerRef.current = window.setTimeout(() => {
      returnLiftTimerRef.current = 0
      state.targetAngle = MIN_ANGLE
      scheduleFrame()
    }, RETURN_LIFT_DELAY_MS)

    return () => {
      if (returnLiftTimerRef.current) {
        window.clearTimeout(returnLiftTimerRef.current)
        returnLiftTimerRef.current = 0
      }
    }
  }, [returnRequested, scheduleFrame])

  useEffect(() => {
    if (!armReturnRequested || returnRequested) return

    const state = stateRef.current
    if (state.pointerId !== null) return

    state.isArmReturning = true
    state.armReturned = Math.abs(state.angle - MIN_ANGLE) < 0.08
    if (state.armReturned) {
      state.isArmReturning = false
      state.targetAngle = MIN_ANGLE
      scheduleFrame()
      return
    }

    armRef.current?.classList.add('is-return-lifted')
    returnLiftTimerRef.current = window.setTimeout(() => {
      returnLiftTimerRef.current = 0
      state.targetAngle = MIN_ANGLE
      scheduleFrame()
    }, RETURN_LIFT_DELAY_MS)

    return () => {
      if (returnLiftTimerRef.current) {
        window.clearTimeout(returnLiftTimerRef.current)
        returnLiftTimerRef.current = 0
      }
    }
  }, [armReturnRequested, returnRequested, scheduleFrame])

  useEffect(() => () => {
    if (frameRef.current) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
    }
    if (returnLiftTimerRef.current) {
      window.clearTimeout(returnLiftTimerRef.current)
    }
  }, [])

  const getPointerAngle = (event) => {
    const svg =
      event.currentTarget.tagName.toLowerCase() === 'svg'
        ? event.currentTarget
        : event.currentTarget.ownerSVGElement
    const bounds = svg.getBoundingClientRect()
    const x = ((event.clientX - bounds.left) / bounds.width) * 900
    const y = ((event.clientY - bounds.top) / bounds.height) * 600
    const angle =
      (Math.atan2(y - PIVOT_Y, x - PIVOT_X) * 180) / Math.PI
    return Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, angle))
  }

  const handlePointerDown = (event) => {
    if (
      event.button !== 0 ||
      stateRef.current.isReturning
    ) {
      return
    }

    event.preventDefault()
    if (returnLiftTimerRef.current) {
      window.clearTimeout(returnLiftTimerRef.current)
      returnLiftTimerRef.current = 0
    }
    stateRef.current.isArmReturning = false
    armRef.current?.classList.remove('is-return-lifted')
    onTonearmDragStart?.()
    event.currentTarget.setPointerCapture(event.pointerId)
    stateRef.current.pointerId = event.pointerId
    stateRef.current.lastReportedProgress = null
    stateRef.current.targetAngle = getPointerAngle(event)
    armRef.current?.classList.add('is-held')
    setIsDragging(true)
    scheduleFrame()
  }

  const handlePointerMove = (event) => {
    if (stateRef.current.pointerId !== event.pointerId) return
    event.preventDefault()
    stateRef.current.targetAngle = getPointerAngle(event)
    scheduleFrame()
  }

  const finishPointer = (event, shouldResumeAudio = true) => {
    if (stateRef.current.pointerId !== event.pointerId) return
    const angle = stateRef.current.targetAngle
    const distance = getNeedleDistance(angle)
    stateRef.current.pointerId = null
    armRef.current?.classList.remove('is-held')
    setIsDragging(false)
    if (shouldResumeAudio) {
      onTonearmRelease?.({
        onRecord:
          distance <= RECORD_OUTER_RADIUS && distance >= RECORD_INNER_RADIUS,
        progress: getPlaybackProgress(angle),
      })
    }
    scheduleFrame()
  }

  const displayPlaying = hasAudio ? isAudioPlaying : isOnRecord
  const statusText = audioError
    ? 'AUDIO ERROR'
    : displayPlaying
      ? '33⅓ RPM · VINYL IN MOTION'
      : '33⅓ RPM · READY'

  return (
    <div
      className={`turntable-assembly${isDragging ? ' is-arm-held' : ''}${returnRequested ? ' is-returning' : ''}`}
      ref={turntableRef}
    >
      <div className="turntable-chassis" aria-hidden="true">
        <span className="chassis-brand">RECORD ROOM</span>
        <span className="chassis-edition">REFERENCE DECK · 33⅓</span>
        <span className="chassis-screw chassis-screw--one" />
        <span className="chassis-screw chassis-screw--two" />
        <span className="chassis-screw chassis-screw--three" />
        <span className="chassis-screw chassis-screw--four" />
      </div>

      <div className="platter-housing" aria-hidden="true">
        <span className="platter-edge" />
        <span className="platter-ring" />
        <span className="platter-center" />
      </div>
      <div
        className={`platter-vinyl${showRecord ? ' has-record' : ''}`}
        aria-hidden="true"
      >
        <VinylRecord
          coverUrl={coverUrl}
          albumTitle={albumTitle}
          recordRef={recordRef}
        />
      </div>
      <span className="platter-spindle" aria-hidden="true" />

      <svg
        className="tonearm-svg"
        viewBox="0 0 900 600"
        role="img"
        aria-label="드래그하여 조작하는 턴테이블 톤암"
      >
        <defs>
          <linearGradient id="tonearm-metal" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.22" stopColor="#aeb2bb" />
            <stop offset="0.45" stopColor="#fdfdff" />
            <stop offset="0.72" stopColor="#8e929c" />
            <stop offset="1" stopColor="#f7f8fb" />
          </linearGradient>
          <linearGradient id="tonearm-head" x1="0" x2="1">
            <stop offset="0" stopColor="#858a94" />
            <stop offset="0.45" stopColor="#f8f9fb" />
            <stop offset="1" stopColor="#777c86" />
          </linearGradient>
          <radialGradient id="tonearm-pivot">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.38" stopColor="#d7d9de" />
            <stop offset="0.7" stopColor="#858a94" />
            <stop offset="1" stopColor="#f7f8fa" />
          </radialGradient>
        </defs>

        <g className="tonearm-rest" aria-hidden="true">
          <path
            d="M629 433 L650 412 L671 433 L650 454 Z"
            fill="url(#tonearm-metal)"
            stroke="#9297a1"
            strokeWidth="2"
          />
          <path d="M635 431 L650 414" stroke="#fff" strokeWidth="3" />
        </g>
        <g className="tonearm-pivot" aria-hidden="true">
          <circle cx={PIVOT_X} cy={PIVOT_Y} r="29" fill="url(#tonearm-pivot)" />
          <circle cx={PIVOT_X} cy={PIVOT_Y} r="20" fill="#d9dce1" />
          <circle cx={PIVOT_X} cy={PIVOT_Y} r="13" fill="url(#tonearm-metal)" />
          <circle cx={PIVOT_X} cy={PIVOT_Y} r="5" fill="#777d87" />
          <circle cx="702" cy="69" r="3" fill="#fff" opacity=".8" />
        </g>
        <g
          className={`tonearm-group${hasStartedPlayback && !isAudioPlaying ? ' is-paused-lifted' : ''}`}
          ref={armRef}
          transform={`rotate(${INITIAL_ANGLE - ARM_BASE_ANGLE} ${PIVOT_X} ${PIVOT_Y})`}
        >
          <path
            className="tonearm-shadow"
            d={`M${PIVOT_X} ${PIVOT_Y} L${NEEDLE_X} ${NEEDLE_Y}`}
            stroke="#4d535d"
            strokeWidth="17"
            strokeLinecap="round"
          />
          <path
            className="tonearm-body"
            d={`M${PIVOT_X} ${PIVOT_Y} L${NEEDLE_X} ${NEEDLE_Y}`}
            stroke="url(#tonearm-metal)"
            strokeWidth="13"
            strokeLinecap="round"
          />
          <path
            d="M691 77.5 L371 83"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
            opacity=".88"
          />
          <path
            d="M350 70 L379 70 L390 91 L358 91 Z"
            fill="url(#tonearm-head)"
            stroke="#777d87"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M350 84 L350 90" stroke="#5d626c" strokeWidth="2" />
          <path d="M350 89 L350 94" stroke="#343840" strokeWidth="1.5" />
          <path
            className="tonearm-hit-area"
            d={`M${PIVOT_X} ${PIVOT_Y} L${NEEDLE_X} ${NEEDLE_Y}`}
            stroke="transparent"
            strokeWidth="38"
            strokeLinecap="round"
            pointerEvents="stroke"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishPointer}
            onPointerCancel={(event) => finishPointer(event, false)}
          />
        </g>
      </svg>

      <div
        className={`turntable-status${displayPlaying ? ' is-playing' : ''}`}
        role="status"
        aria-live="polite"
      >
        <span className="status-indicator" />
        <span>{statusText}</span>
      </div>
    </div>
  )
}

export default Turntable
