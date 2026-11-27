import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import '../styles/AlbumSleeve.css'

function updateSleeveReflection(event) {
  if (event.pointerType !== 'mouse') return

  const bounds = event.currentTarget.getBoundingClientRect()
  const x = ((event.clientX - bounds.left) / bounds.width) * 100
  const y = ((event.clientY - bounds.top) / bounds.height) * 100
  event.currentTarget.style.setProperty('--reflection-x', `${x}%`)
  event.currentTarget.style.setProperty('--reflection-y', `${y}%`)
}

function AlbumSleeve({
  track,
  index,
  positionRef,
  onActivate,
  onFocus,
}) {
  const reduceMotion = useReducedMotion()
  const [isHovered, setIsHovered] = useState(false)
  const imagePath = track.artwork?.imageUrl
  const imageUrl = imagePath
    ? imagePath.startsWith('http')
      ? imagePath
      : `${import.meta.env.BASE_URL}${imagePath.replace(/^\/+/, '')}`
    : null
  const SleeveElement = motion.button
  const cover = (
    <>
      {imageUrl ? (
        <img
          className="album-cover-image"
          src={imageUrl}
          alt=""
          draggable="false"
          loading={index < 3 ? 'eager' : 'lazy'}
          decoding="async"
        />
      ) : (
        <span className="temporary-cover" role="img" aria-label="공식 커버 미확인">
          <span className="temporary-cover-kicker">RECORD ROOM / NO. {String(track.id).padStart(2, '0')}</span>
          <span className="temporary-cover-title">COVER<br />PENDING</span>
          <span className="temporary-cover-label">APPLE MUSIC SEARCH</span>
        </span>
      )}
      <span className="shrink-wrap" aria-hidden="true" />
      <span className="sleeve-seams" aria-hidden="true" />
    </>
  )

  return (
    <div
      className="record-position"
      ref={(element) => positionRef(index, element)}
      role="listitem"
    >
      <SleeveElement
        className="album-hit-area"
        type="button"
        aria-label={`${track.title} — ${track.artist} 선택`}
        onClick={(event) => onActivate(event.currentTarget)}
        onMouseEnter={() => {
          setIsHovered(true)
        }}
        onMouseLeave={() => {
          setIsHovered(false)
        }}
        onPointerMove={updateSleeveReflection}
        onFocus={onFocus}
      >
        <motion.span
          className="album-sleeve"
          animate={{ z: isHovered && !reduceMotion ? -4 : 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        >
          <span className="album-object">
            <span className="album-face album-face--back" aria-hidden="true" />
            <span className="album-side album-side--left" aria-hidden="true" />
            <span className="album-side album-side--right" aria-hidden="true" />
            <span className="album-side album-side--top" aria-hidden="true" />
            <span className="album-side album-side--bottom" aria-hidden="true" />
            <span className="album-face album-face--front">{cover}</span>
          </span>
        </motion.span>
      </SleeveElement>
    </div>
  )
}

export default AlbumSleeve
