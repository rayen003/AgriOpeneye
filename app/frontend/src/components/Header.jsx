import { useState, useEffect, useRef } from 'react'
import { CROP_COLORS, CROP_LABELS, ALL_FILTER_CROPS } from '../constants.js'

function GeoSearch({ onSearchPoint, searchError, onClearSearch, hasSearchPoint }) {
  const [query, setQuery]           = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading]       = useState(false)
  const [open, setOpen]             = useState(false)
  const debounceRef                 = useRef(null)
  const wrapperRef                  = useRef(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const fetchSuggestions = (q) => {
    clearTimeout(debounceRef.current)

    // Coord shortcut: skip geocoding
    const coord = q.trim().match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/)
    if (coord) {
      setSuggestions([{
        display_name: `${parseFloat(coord[1]).toFixed(4)}, ${parseFloat(coord[2]).toFixed(4)}`,
        lat: coord[1], lon: coord[2],
        _isCoord: true,
      }])
      setOpen(true)
      return
    }

    if (q.length < 3) { setSuggestions([]); setOpen(false); return }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1`
        const res = await fetch(url, { headers: { 'User-Agent': 'AgriOpenEye/1.0' } })
        const data = await res.json()
        setSuggestions(data)
        setOpen(data.length > 0)
      } catch {
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    }, 350)
  }

  const handleChange = (e) => {
    setQuery(e.target.value)
    fetchSuggestions(e.target.value)
  }

  const handleSelect = (s) => {
    const label = s._isCoord
      ? s.display_name
      : s.display_name.split(',').slice(0, 2).join(',').trim()
    setQuery(label)
    setOpen(false)
    setSuggestions([])
    onSearchPoint({ lat: parseFloat(s.lat), lon: parseFloat(s.lon), label })
  }

  const handleClear = () => {
    setQuery('')
    setSuggestions([])
    setOpen(false)
    onClearSearch()
  }

  return (
    <div ref={wrapperRef} className="relative flex items-center gap-1.5 flex-shrink-0">
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40 text-[11px] pointer-events-none">
          {loading ? '⏳' : '🔍'}
        </span>
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="Address or lat, lon…"
          className="bg-white/10 text-white placeholder-white/30 text-xs pl-7 pr-3 py-1.5 rounded-lg border border-white/10 focus:outline-none focus:border-white/30 w-48 transition-all focus:w-60"
        />
      </div>

      {(hasSearchPoint || query) && (
        <button
          type="button"
          onClick={handleClear}
          className="text-white/50 hover:text-white text-sm leading-none px-0.5"
        >×</button>
      )}

      {searchError && (
        <span className="text-red-300 text-[10px]">{searchError}</span>
      )}

      {/* Dropdown */}
      {open && suggestions.length > 0 && (
        <ul className="absolute top-full left-0 mt-1 w-72 bg-white rounded-lg shadow-lg border border-stone-100 overflow-hidden z-[9999] text-stone-700">
          {suggestions.map((s, i) => {
            const parts = s.display_name.split(',')
            const main  = parts[0].trim()
            const sub   = parts.slice(1, 3).join(',').trim()
            return (
              <li
                key={i}
                className="px-3 py-2 hover:bg-stone-50 cursor-pointer border-b border-stone-50 last:border-0"
                onMouseDown={() => handleSelect(s)}
              >
                <div className="text-xs font-medium text-stone-700 truncate">{main}</div>
                {sub && <div className="text-[10px] text-stone-400 truncate">{sub}</div>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default function Header({
  region, onRegionChange,
  activeCrops, onCropToggle, total,
  onSearchPoint, searchError, onClearSearch, hasSearchPoint,
}) {
  return (
    <header className="h-14 bg-field text-white flex items-center px-5 gap-5 flex-shrink-0 shadow-sm">
      {/* Brand */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-lg">🌾</span>
        <span className="font-semibold text-sm tracking-wide">AgriOpenEye</span>
      </div>

      <div className="w-px h-5 bg-white/20" />

      {/* Region toggle */}
      <div className="flex bg-white/10 rounded-lg p-0.5 gap-0.5 flex-shrink-0">
        {['catalonia', 'bavaria'].map(r => (
          <button
            key={r}
            onClick={() => onRegionChange(r)}
            className={`px-3 py-1 rounded-md text-sm font-medium capitalize transition-colors ${
              region === r ? 'bg-white text-field shadow-sm' : 'text-white/70 hover:text-white'
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-white/20" />

      <GeoSearch
        onSearchPoint={onSearchPoint}
        searchError={searchError}
        onClearSearch={onClearSearch}
        hasSearchPoint={hasSearchPoint}
      />

      <div className="w-px h-5 bg-white/20" />

      {/* Crop filter chips */}
      <div className="flex items-center gap-2 flex-1 overflow-x-auto min-w-0">
        <span className="text-xs text-white/40 flex-shrink-0">Show:</span>
        {ALL_FILTER_CROPS.map(crop => {
          const on = activeCrops.has(crop)
          return (
            <button
              key={crop}
              onClick={() => onCropToggle(crop)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-medium transition-all flex-shrink-0 ${
                on ? 'text-white shadow-sm' : 'bg-white/10 text-white/40 hover:text-white/70'
              }`}
              style={on ? { backgroundColor: CROP_COLORS[crop] } : {}}
            >
              {CROP_LABELS[crop]}
            </button>
          )
        })}
      </div>

      <span className="text-xs text-white/40 flex-shrink-0 ml-auto">
        {total} parcel{total !== 1 ? 's' : ''}
      </span>
    </header>
  )
}
