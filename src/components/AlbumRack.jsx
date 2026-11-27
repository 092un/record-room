import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import AlbumSleeve from './AlbumSleeve'
import '../styles/AlbumRack.css'

const DRAG_THRESHOLD = 6
const BASE_RECORD_ANGLE = 84
const CURSOR_ROTATION_RANGE = 5
const SLOT_GAP = 6

function AlbumRack({
  tracks,
  navigationIndex,
  onActiveTrackChange,
  onAlbumSelect,
  isExiting,
}) {
  const railRef = useRef(null)
  const positionRefs = useRef(new Map())
  const dragRef = useRef(null)
  const velocityRef = useRef(0)
  const animationRef = useRef(0)
  const scrollFrameRef = useRef(0)
  const updateActiveIndexRef = useRef(false)
  const suppressClickRef = useRef(false)
  const cursorClientXRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const reduceMotion = useReducedMotion()

  const updateFixedLayout = useCallback(() => {
    const rail = railRef.current
    if (!rail) return

    const firstItem = positionRefs.current.get(0)
    const record = firstItem?.querySelector('.album-object')
    const recordSize = record?.offsetWidth ?? 0
    if (!recordSize) return

    const jacketDepth = window.matchMedia('(max-width: 760px)').matches ? 5 : 6
    const angleRadians = (BASE_RECORD_ANGLE * Math.PI) / 180
    const slotWidth = Math.ceil(
      recordSize * Math.cos(angleRadians) +
        jacketDepth * Math.sin(angleRadians) +
        SLOT_GAP,
    )

    positionRefs.current.forEach((element) => {
      element.style.setProperty('--slot-width', `${slotWidth}px`)
    })
    rail.style.setProperty('--first-slot-width', `${slotWidth}px`)
    rail.style.setProperty('--last-slot-width', `${slotWidth}px`)
  }, [])

  const updateAlbumPositions = useCallback((shouldUpdateActiveIndex = true) => {
    const rail = railRef.current
    if (!rail) return

    const railBounds = rail.getBoundingClientRect()
    if (cursorClientXRef.current === null) {
      cursorClientXRef.current = window.innerWidth / 2
    }

    const cursorContentX =
      rail.scrollLeft + cursorClientXRef.current - railBounds.left
    const influenceRadius = Math.max(
      120,
      Math.min(180, rail.clientWidth * 0.22),
    )
    let closestIndex = 0
    let closestDistance = Number.POSITIVE_INFINITY

    positionRefs.current.forEach((element, index) => {
      const layoutCenterX = element.offsetLeft + element.offsetWidth / 2
      const distanceFromCursor = layoutCenterX - cursorContentX
      const proximity = Math.max(
        0,
        1 - Math.abs(distanceFromCursor) / influenceRadius,
      )
      const easedProximity = proximity * proximity * (3 - 2 * proximity)
      const angle =
        BASE_RECORD_ANGLE + CURSOR_ROTATION_RANGE * easedProximity
      const direction = distanceFromCursor < 0 ? -1 : 1

      element.style.setProperty('--record-yaw', `${direction * angle}deg`)

      const distanceFromViewportCenter =
        layoutCenterX - (rail.scrollLeft + rail.clientWidth / 2)
      if (Math.abs(distanceFromViewportCenter) < closestDistance) {
        closestDistance = Math.abs(distanceFromViewportCenter)
        closestIndex = index
      }
    })

    if (shouldUpdateActiveIndex) {
      setActiveIndex((currentIndex) =>
        currentIndex === closestIndex ? currentIndex : closestIndex,
      )
    }
  }, [])

  const schedulePositionUpdate = useCallback((shouldUpdateActiveIndex = true) => {
    if (shouldUpdateActiveIndex) updateActiveIndexRef.current = true
    if (scrollFrameRef.current) return
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = 0
      const updateActiveIndex = updateActiveIndexRef.current
      updateActiveIndexRef.current = false
      updateAlbumPositions(updateActiveIndex)
    })
  }, [updateAlbumPositions])

  const stopInertia = useCallback(() => {
    if (animationRef.current) {
      window.cancelAnimationFrame(animationRef.current)
      animationRef.current = 0
    }
  }, [])

  const startInertia = useCallback(() => {
    if (reduceMotion) {
      velocityRef.current = 0
      return
    }

    stopInertia()
    let previousTime = 0

    const step = (time) => {
      if (!previousTime) previousTime = time
      const elapsed = Math.min(time - previousTime, 32)
      previousTime = time

      const rail = railRef.current
      if (!rail) return

      rail.scrollLeft += velocityRef.current * elapsed
      velocityRef.current *= Math.pow(0.92, elapsed / 16.67)
      schedulePositionUpdate()

      if (Math.abs(velocityRef.current) < 0.025) {
        velocityRef.current = 0
        animationRef.current = 0
        return
      }

      animationRef.current = window.requestAnimationFrame(step)
    }

    animationRef.current = window.requestAnimationFrame(step)
  }, [reduceMotion, schedulePositionUpdate, stopInertia])

  useLayoutEffect(() => {
    const rail = railRef.current
    if (!rail) return undefined

    const handleWheel = (event) => {
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY
      if (!delta) return

      event.preventDefault()
      const unit = event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? rail.clientWidth
          : 1
      const movement = delta * unit

      stopInertia()
      rail.scrollLeft += movement
      velocityRef.current = movement * 0.004
      startInertia()
    }

    const handleScroll = () => schedulePositionUpdate()
    const handleResize = () => {
      updateFixedLayout()
      schedulePositionUpdate()
    }
    const handleWindowPointerMove = (event) => {
      if (event.pointerType !== 'mouse') return
      cursorClientXRef.current = event.clientX
      schedulePositionUpdate(false)

      const drag = dragRef.current
      if (!drag || drag.pointerType !== 'mouse' || drag.pointerId !== event.pointerId) {
        return
      }

      const distance = event.clientX - drag.startX
      if (Math.abs(distance) > DRAG_THRESHOLD) drag.didDrag = true
      if (!drag.didDrag) return

      event.preventDefault()
      const now = performance.now()
      const elapsed = Math.max(now - drag.lastTime, 1)
      const movement = drag.lastX - event.clientX

      rail.scrollLeft = drag.startScroll - distance
      velocityRef.current = movement / elapsed
      drag.lastX = event.clientX
      drag.lastTime = now
    }

    const finishWindowPointerGesture = (event) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return

      if (drag.didDrag) {
        suppressClickRef.current = true
        window.setTimeout(() => {
          suppressClickRef.current = false
        }, 300)
      }

      if (drag.pointerType === 'mouse') {
        setIsDragging(false)
        if (drag.didDrag) startInertia()
      }
      dragRef.current = null
    }

    rail.addEventListener('wheel', handleWheel, { passive: false })
    rail.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('pointermove', handleWindowPointerMove, {
      passive: false,
    })
    window.addEventListener('pointerup', finishWindowPointerGesture)
    window.addEventListener('pointercancel', finishWindowPointerGesture)
    window.addEventListener('resize', handleResize)
    updateFixedLayout()
    updateAlbumPositions()

    return () => {
      rail.removeEventListener('wheel', handleWheel)
      rail.removeEventListener('scroll', handleScroll)
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', finishWindowPointerGesture)
      window.removeEventListener('pointercancel', finishWindowPointerGesture)
      window.removeEventListener('resize', handleResize)
      stopInertia()
      if (scrollFrameRef.current) {
        window.cancelAnimationFrame(scrollFrameRef.current)
      }
    }
  }, [
    schedulePositionUpdate,
    startInertia,
    stopInertia,
    updateAlbumPositions,
    updateFixedLayout,
  ])

  useEffect(() => {
    const activeTrack = tracks[activeIndex]
    if (activeTrack) onActiveTrackChange(activeTrack)
  }, [activeIndex, onActiveTrackChange, tracks])

  useEffect(() => {
    if (!Number.isInteger(navigationIndex)) return

    const rail = railRef.current
    const position = positionRefs.current.get(navigationIndex)
    if (!rail || !position) return

    const railBounds = rail.getBoundingClientRect()
    const positionBounds = position.getBoundingClientRect()
    const distance =
      positionBounds.left +
      positionBounds.width / 2 -
      (railBounds.left + rail.clientWidth / 2)
    const target = rail.scrollLeft + distance

    if (reduceMotion) {
      rail.scrollLeft = target
    } else {
      rail.scrollTo({ left: target, behavior: 'smooth' })
    }
    schedulePositionUpdate()
  }, [navigationIndex, reduceMotion, schedulePositionUpdate])

  const setPositionRef = useCallback((index, element) => {
    if (element) {
      positionRefs.current.set(index, element)
    } else {
      positionRefs.current.delete(index)
    }
  }, [])

  const handlePointerDown = (event) => {
    if (event.pointerType === 'mouse') {
      if (event.button !== 0) return
      stopInertia()
      setIsDragging(true)
    }

    dragRef.current = {
      pointerType: event.pointerType,
      pointerId: event.pointerId,
      startX: event.clientX,
      startScroll: railRef.current.scrollLeft,
      lastX: event.clientX,
      lastTime: performance.now(),
      didDrag: false,
    }
  }

  const handleClickCapture = (event) => {
    if (!suppressClickRef.current) return
    event.preventDefault()
    event.stopPropagation()
    suppressClickRef.current = false
  }

  const activateAlbum = (track, index, element) => {
    setActiveIndex(index)
    if (!onAlbumSelect) return

    const sleeve = element.querySelector('.album-sleeve')
    const albumObject = element.querySelector('.album-object')
    if (!sleeve || !albumObject) {
      console.error(`Unable to animate album ${track.id}: album elements were not found.`)
      return
    }

    const bounds = sleeve.getBoundingClientRect()
    const originYaw =
      Number.parseFloat(
        window.getComputedStyle(albumObject).getPropertyValue('--record-yaw'),
      ) || -BASE_RECORD_ANGLE

    onAlbumSelect({
      track,
      originRect: {
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
      },
      originYaw,
    })
  }

  return (
    <div
      className={`record-viewport${isDragging ? ' is-dragging' : ''}${isExiting ? ' is-exiting' : ''}`}
      onPointerDown={handlePointerDown}
      onClickCapture={handleClickCapture}
    >
      <div
        className="record-rail"
        ref={railRef}
        role="list"
        aria-label="가로로 넘겨 보는 LP 24장"
      >
        {tracks.map((track, index) => (
          <AlbumSleeve
            key={track.id}
            track={track}
            index={index}
            positionRef={setPositionRef}
            onActivate={(element) => activateAlbum(track, index, element)}
            onFocus={() => setActiveIndex(index)}
          />
        ))}
      </div>
    </div>
  )
}

export default AlbumRack
