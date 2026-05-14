import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { CROP_REFS } from '../constants.js'

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const FEATURE_META = {
  ndvi_peak_value: {
    label: 'Peak NDVI',
    refKey: 'ndvi_peak_value',
    fmt: v => v.toFixed(3),
    tip: 'Max vegetation greenness during the crop\'s expected peak window. Higher = more vigorous growth. Ranges from –1 (bare/water) to 1 (dense canopy).',
  },
  ndvi_peak_timing_month: {
    label: 'Peak month',
    refKey: null,
    fmt: v => MONTH_NAMES[Math.round(v) - 1] ?? `M${v}`,
    tip: 'Month when NDVI reached its global maximum. Each crop has a characteristic peak season — mismatch suggests wrong crop type or stressed growth.',
  },
  ndvi_greenup_rate: {
    label: 'Green-up rate',
    refKey: null,
    fmt: v => v.toFixed(4),
    tip: 'NDVI slope from February to peak (NDVI units/month). Positive = vegetation greening up in spring. Faster rate = more vigorous establishment.',
  },
  ndvi_senescence_rate: {
    label: 'Senescence rate',
    refKey: null,
    fmt: v => v.toFixed(4),
    tip: 'NDVI slope from peak to November. Negative values are NORMAL — they mean the crop is dying back after harvest (expected seasonal decline). More negative = faster die-back.',
  },
  ndwi_at_peak: {
    label: 'NDWI at peak',
    refKey: 'ndwi_at_peak',
    fmt: v => v.toFixed(3),
    tip: 'Water content index at peak season (uses green + NIR bands). Higher = more water in vegetation. Vineyards and irrigated crops tend to be higher; drought-tolerant crops lower.',
  },
  ndre_at_peak: {
    label: 'NDRE at peak',
    refKey: 'ndre_at_peak',
    fmt: v => v.toFixed(3),
    tip: 'Chlorophyll/nitrogen index at peak (uses red-edge + NIR bands). Higher = more chlorophyll. Sensitive to crop health and nitrogen status, less affected by soil background.',
  },
  ndvi_offseason: {
    label: 'Off-season NDVI',
    refKey: null,
    fmt: v => v.toFixed(3),
    tip: 'Mean NDVI during December–February (dormancy period). Annual crops should be near zero (bare soil). Vineyards retain some woody structure so show slightly higher values.',
  },
  literature_distance: {
    label: 'Literature dist.',
    refKey: null,
    fmt: v => v.toFixed(3),
    tip: 'Euclidean distance between observed spectral profile and crop reference midpoint (from remote sensing literature). Lower = closer match to known crop signature. Think of it as a dissimilarity score.',
  },
}

function InfoTooltip({ text }) {
  const [pos, setPos] = useState(null)
  const ref = useRef(null)

  const handleEnter = () => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect()
      setPos({ x: r.left + r.width / 2, y: r.top })
    }
  }
  const handleLeave = () => setPos(null)

  return (
    <span
      ref={ref}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      className="inline-flex items-center justify-center ml-1 align-middle w-3.5 h-3.5 rounded-full bg-stone-200 text-stone-500 hover:bg-stone-300 hover:text-stone-700 cursor-help transition-colors flex-shrink-0"
      style={{ fontSize: 9, fontWeight: 700, fontStyle: 'normal', lineHeight: 1 }}
      aria-label="More info"
    >
      i
      {pos && typeof document !== 'undefined' && createPortal(
        <span
          style={{
            position: 'fixed',
            left: Math.min(pos.x, window.innerWidth - 220),
            top: pos.y - 8,
            transform: 'translate(-50%, -100%)',
            zIndex: 9999,
          }}
          className="w-52 bg-stone-800 text-white text-[10px] rounded-lg px-2.5 py-2 leading-relaxed shadow-xl pointer-events-none"
        >
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-stone-800" />
        </span>,
        document.body
      )}
    </span>
  )
}

function StatusBadge({ value, range }) {
  if (!range || value == null) return null
  if (value < range[0]) return <span className="ml-1.5 text-amber-500 font-bold">↓</span>
  if (value > range[1]) return <span className="ml-1.5 text-amber-500 font-bold">↑</span>
  return <span className="ml-1.5 text-green-600 font-bold">✓</span>
}

export default function FeatureTable({ features, crop }) {
  const row  = features?.find(f => f.crop === crop)
  const refs = CROP_REFS[crop] ?? {}

  if (!row) {
    return <p className="text-xs text-stone-400 text-center py-6">No feature data for this crop.</p>
  }

  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="text-stone-400 text-[10px] uppercase tracking-wide">
          <th className="text-left pb-2 font-medium">Feature</th>
          <th className="text-right pb-2 font-medium">Observed</th>
          <th className="text-right pb-2 font-medium">Reference</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(FEATURE_META).map(([key, meta]) => {
          const raw = row[key]
          if (raw == null || (typeof raw === 'number' && isNaN(raw))) return null
          const range = meta.refKey ? refs[meta.refKey] : null

          return (
            <tr
              key={key}
              className="border-t border-stone-50 hover:bg-stone-50 transition-colors"
            >
              <td className="py-1.5 pr-2 text-stone-600 whitespace-nowrap">
                {meta.label}
                <InfoTooltip text={meta.tip} />
              </td>
              <td className="py-1.5 text-right font-mono text-stone-800 whitespace-nowrap">
                {meta.fmt(raw)}
                <StatusBadge value={raw} range={range} />
              </td>
              <td className="py-1.5 pl-3 text-right text-stone-400 whitespace-nowrap">
                {range ? `${range[0]} – ${range[1]}` : '—'}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
