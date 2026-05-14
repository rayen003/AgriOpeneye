import { useState, useEffect, useCallback } from 'react'
import Header from './components/Header.jsx'
import ParcelMap from './components/ParcelMap.jsx'
import DetailPanel from './components/DetailPanel.jsx'
import ChatPanel from './components/ChatPanel.jsx'
import { ALL_FILTER_CROPS } from './constants.js'

// Haversine distance in km
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

function findNearest(parcels, lat, lon) {
  let best = null, bestDist = Infinity
  parcels.forEach(p => {
    if (p.lat == null || p.lon == null) return
    const d = haversine(lat, lon, p.lat, p.lon)
    if (d < bestDist) { bestDist = d; best = p }
  })
  return best ? { parcel: best, distanceKm: bestDist } : null
}

export default function App() {
  const [region, setRegion]                 = useState('catalonia')
  const [scores, setScores]                 = useState([])
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState(null)
  const [selectedParcel, setSelectedParcel] = useState(null)
  const [features, setFeatures]             = useState(null)
  const [featLoading, setFeatLoading]       = useState(false)
  const [activeCrops, setActiveCrops]       = useState(new Set(ALL_FILTER_CROPS))
  const [searchPoint, setSearchPoint]       = useState(null)   // {lat, lon, label}
  const [searchResult, setSearchResult]     = useState(null)   // {parcel, distanceKm}
  const [searchError, setSearchError]       = useState(null)
  const [chatOpen, setChatOpen]             = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setSelectedParcel(null)
    setFeatures(null)
    setSearchPoint(null)
    setSearchResult(null)
    fetch(`/api/scores/${region}`)
      .then(r => {
        if (!r.ok) throw new Error(`API error ${r.status}`)
        return r.json()
      })
      .then(data => { setScores(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [region])

  const handleSelectParcel = (parcel) => {
    setSelectedParcel(parcel)
    setFeatures(null)
    setFeatLoading(true)
    fetch(`/api/features/${region}/${parcel.parcel_id}`)
      .then(r => r.json())
      .then(data => { setFeatures(data); setFeatLoading(false) })
      .catch(() => setFeatLoading(false))
  }

  // Called by Header once geocoding is resolved — receives {lat, lon, label}
  const handleSearchPoint = useCallback(({ lat, lon, label }) => {
    setSearchError(null)
    const point = { lat, lon, label }
    setSearchPoint(point)

    // Search only visible (filtered) parcels so line always points to rendered cell
    const currentFiltered = scores.filter(s =>
      activeCrops.has(s.recommendation || s.best_crop || 'uncertain')
    )
    const result = findNearest(currentFiltered, lat, lon)
    if (result) {
      setSearchResult(result)
      handleSelectParcel(result.parcel)
    } else {
      setSearchResult(null)
    }
  }, [scores, activeCrops])

  const handleClearSearch = () => {
    setSearchPoint(null)
    setSearchResult(null)
    setSearchError(null)
    setSelectedParcel(null)
    setFeatures(null)
  }

  const handleCropToggle = (crop) => {
    setActiveCrops(prev => {
      const next = new Set(prev)
      next.has(crop) ? next.delete(crop) : next.add(crop)
      return next
    })
  }

  const filteredScores = scores.filter(s =>
    activeCrops.has(s.recommendation || s.best_crop || 'uncertain')
  )

  return (
    <div className="h-screen flex flex-col bg-parchment font-sans">
      <Header
        region={region}
        onRegionChange={setRegion}
        activeCrops={activeCrops}
        onCropToggle={handleCropToggle}
        total={filteredScores.length}
        onSearchPoint={handleSearchPoint}
        searchError={searchError}
        onClearSearch={handleClearSearch}
        hasSearchPoint={!!searchPoint}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-parchment/80">
              <p className="text-stone-500 text-sm">Loading parcels…</p>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-parchment/80">
              <p className="text-red-600 text-sm">Failed to load data: {error}</p>
            </div>
          )}
          <ParcelMap
            scores={filteredScores}
            selectedParcel={selectedParcel}
            onSelectParcel={handleSelectParcel}
            onDeselect={() => { setSelectedParcel(null); setFeatures(null) }}
            region={region}
            searchPoint={searchPoint}
            searchResult={searchResult}
          />
          <ChatPanel
            isOpen={chatOpen}
            onToggle={() => setChatOpen(o => !o)}
            selectedParcel={selectedParcel}
            region={region}
          />
        </div>

        <DetailPanel
          parcel={selectedParcel}
          features={features}
          featLoading={featLoading}
          onClose={() => {
            setSelectedParcel(null)
            setFeatures(null)
            setSearchPoint(null)
            setSearchResult(null)
          }}
          region={region}
          distanceKm={searchResult?.distanceKm ?? null}
          searchLabel={searchPoint?.label ?? null}
        />
      </div>
    </div>
  )
}
