import { useState, useEffect } from 'react'
import ScoreChart from './ScoreChart.jsx'
import FeatureTable from './FeatureTable.jsx'
import { CROP_COLORS, CROP_LABELS, TARGET_CROPS, REGION_CONFIG } from '../constants.js'

function ScoreBadge({ parcel }) {
  const best_crop = parcel.best_crop || 'uncertain'
  const score     = parcel.best_score ?? 0
  const margin    = parcel.score_margin ?? 0
  const color     = CROP_COLORS[best_crop] ?? CROP_COLORS.uncertain

  // Show best crop always, but label confidence
  const confident = score >= 55 && margin >= 10
  const lowScore  = score < 55
  const lowMargin = margin < 10 && margin >= 0

  return (
    <div className="rounded-xl p-4 mb-4 text-white" style={{ backgroundColor: color }}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider opacity-80 mb-1">
            Best match
          </div>
          <div className="text-xl font-bold">{CROP_LABELS[best_crop] ?? best_crop}</div>
          <div className="text-3xl font-black mt-1">{score.toFixed(1)}%</div>
        </div>
        <div className="text-right">
          <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
            confident ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70'
          }`}>
            {confident ? 'High confidence' : 'Low confidence'}
          </span>
          {lowScore && (
            <div className="text-xs opacity-70 mt-1.5">Score below 55%</div>
          )}
          {lowMargin && !lowScore && (
            <div className="text-xs opacity-70 mt-1.5">Margin {margin.toFixed(1)}pp</div>
          )}
        </div>
      </div>
    </div>
  )
}

function Summary({ parcel, crop, region }) {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!parcel || !crop || !region) return
    setLoading(true)
    // Pass the crop-specific score so LLM summary is consistent with model output
    const cropScore = parcel[`score_${crop}`] ?? null
    const scoreParam = cropScore != null ? `?score=${cropScore.toFixed(2)}` : ''
    fetch(`/api/summarize/${region}/${parcel.parcel_id}/${crop}${scoreParam}`)
      .then(r => r.json())
      .then(d => { setSummary(d.summary); setLoading(false) })
      .catch(() => { setSummary(null); setLoading(false) })
  }, [parcel, crop, region])

  if (loading) {
    return <div className="text-[12px] text-stone-400 italic">Analyzing...</div>
  }

  if (!summary) {
    return <div className="text-[12px] text-stone-300 italic">No summary available</div>
  }

  return <div className="text-[13px] text-stone-700 leading-relaxed">{summary}</div>
}

export default function DetailPanel({ parcel, features, featLoading, onClose, region, distanceKm, searchLabel }) {
  const [activeTab, setActiveTab] = useState(TARGET_CROPS[0])

  if (!parcel) {
    return (
      <aside className="w-96 flex-shrink-0 bg-white border-l border-stone-100 flex flex-col items-center justify-center text-center px-8">
        <div className="text-5xl mb-4">🌾</div>
        <p className="text-stone-400 text-sm leading-relaxed">
          Select a parcel on the map to see suitability details
        </p>
      </aside>
    )
  }

  return (
    <aside className="w-96 flex-shrink-0 bg-white border-l border-stone-100 flex flex-col overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100 flex-shrink-0">
        <div>
          <div className="text-xs text-stone-400 font-medium">Parcel {parcel.parcel_id}</div>
          {parcel.lat != null && parcel.lon != null && (
            <div className="text-[10px] text-stone-300 font-mono">
              {parcel.lat.toFixed(4)}, {parcel.lon.toFixed(4)}
            </div>
          )}
          {distanceKm != null && (
            <div className="mt-1 inline-flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
              <span className="text-amber-500 text-[10px]">📍</span>
              <span className="text-[10px] text-amber-700 font-medium">
                {distanceKm < 1
                  ? `${(distanceKm * 1000).toFixed(0)} m from search`
                  : `${distanceKm.toFixed(2)} km from search`}
              </span>
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition-colors text-lg leading-none"
        >
          ×
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        <ScoreBadge parcel={parcel} />

        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 mb-2">
            All crop scores
          </h3>
          <ScoreChart parcel={parcel} />
        </section>

        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 mb-2">
            Feature profile
          </h3>

          <div className="flex gap-1 mb-3 flex-wrap">
            {TARGET_CROPS.map(crop => {
              const active = activeTab === crop
              return (
                <button
                  key={crop}
                  onClick={() => setActiveTab(crop)}
                  className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition-all ${
                    active ? 'text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                  }`}
                  style={active ? { backgroundColor: CROP_COLORS[crop] } : {}}
                >
                  {CROP_LABELS[crop]}
                </button>
              )
            })}
          </div>

          <div className="mb-3 p-2.5 bg-stone-50 rounded-lg border border-stone-100">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 mb-1.5">
              AI Summary
            </div>
            <Summary parcel={parcel} crop={activeTab} region={region} />
          </div>

          {featLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-stone-200 border-t-stone-500 rounded-full animate-spin" />
            </div>
          ) : (
            <FeatureTable features={features} crop={activeTab} />
          )}
        </section>
      </div>
    </aside>
  )
}
