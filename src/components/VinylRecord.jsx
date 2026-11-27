function VinylRecord({ coverUrl, albumTitle, className = '', recordRef }) {
  return (
    <div
      className={`vinyl-record${className ? ` ${className}` : ''}`}
      ref={recordRef}
      role="img"
      aria-label={`LP ${albumTitle}`}
    >
      <span className="vinyl-grooves" aria-hidden="true" />
      <span className="vinyl-sheen" aria-hidden="true" />
      <span className="vinyl-label">
        {coverUrl && <img src={coverUrl} alt="" draggable="false" />}
      </span>
      <span className="vinyl-spindle-hole" aria-hidden="true" />
    </div>
  )
}

export default VinylRecord
