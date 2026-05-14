import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, useMap, CircleMarker, Polyline, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { CROP_COLORS, CROP_LABELS, REGION_CONFIG } from '../constants.js'

function MapController({ region }) {
  const map = useMap()
  useEffect(() => {
    const cfg = REGION_CONFIG[region]
    map.setView(cfg.center, cfg.zoom, { animate: true })
  }, [region, map])
  return null
}

function GridLayer({ scores, selectedParcel, onSelectParcel }) {
  const map = useMap()
  const layerRef = useRef(null)

  useEffect(() => {
    if (!map || scores.length === 0) return

    if (layerRef.current) map.removeLayer(layerRef.current)

    const gridSize = 0.01 // ~1km
    const cells = new Map()

    // Group parcels into grid cells
    scores.forEach(parcel => {
      if (parcel.lat == null || parcel.lon == null) return
      const cellLat = Math.floor(parcel.lat / gridSize) * gridSize
      const cellLon = Math.floor(parcel.lon / gridSize) * gridSize
      const key = `${cellLat},${cellLon}`
      if (!cells.has(key)) cells.set(key, [])
      cells.get(key).push(parcel)
    })

    // Compute bounds from all parcels
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180
    scores.forEach(p => {
      if (p.lat != null) { minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat) }
      if (p.lon != null) { minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon) }
    })
    const bounds = [[minLat - 0.02, minLon - 0.02], [maxLat + 0.02, maxLon + 0.02]]

    // Create SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    svg.setAttribute('viewBox', '0 0 100 100')
    svg.style.pointerEvents = 'auto'

    // Draw grid lines
    const gridStep = (gridSize / (maxLat - minLat)) * 100
    const lonStep = (gridSize / (maxLon - minLon)) * 100

    for (let lat = minLat; lat <= maxLat; lat += gridSize) {
      const y = 100 - ((lat - minLat) / (maxLat - minLat)) * 100
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      line.setAttribute('x1', '0')
      line.setAttribute('y1', y)
      line.setAttribute('x2', '100')
      line.setAttribute('y2', y)
      line.setAttribute('stroke', '#e7e5e4')
      line.setAttribute('stroke-width', '0.5')
      line.setAttribute('opacity', '0.4')
      line.style.pointerEvents = 'none'
      svg.appendChild(line)
    }

    for (let lon = minLon; lon <= maxLon; lon += gridSize) {
      const x = ((lon - minLon) / (maxLon - minLon)) * 100
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      line.setAttribute('x1', x)
      line.setAttribute('y1', '0')
      line.setAttribute('x2', x)
      line.setAttribute('y2', '100')
      line.setAttribute('stroke', '#e7e5e4')
      line.setAttribute('stroke-width', '0.5')
      line.setAttribute('opacity', '0.4')
      line.style.pointerEvents = 'none'
      svg.appendChild(line)
    }

    cells.forEach((parcels, key) => {
      const [cellLat, cellLon] = key.split(',').map(Number)
      const rec = parcels[0].recommendation || parcels[0].best_crop || 'uncertain'
      const color = CROP_COLORS[rec] ?? CROP_COLORS.uncertain
      const isSel = parcels.some(p => selectedParcel?.parcel_id === p.parcel_id)

      // Map lat/lon to SVG percentage (0-100)
      const x = ((cellLon - minLon) / (maxLon - minLon)) * 100
      const y = 100 - ((cellLat + gridSize - minLat) / (maxLat - minLat)) * 100
      const w = (gridSize / (maxLon - minLon)) * 100
      const h = (gridSize / (maxLat - minLat)) * 100

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      g.style.cursor = 'pointer'

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      rect.setAttribute('x', x)
      rect.setAttribute('y', y)
      rect.setAttribute('width', w)
      rect.setAttribute('height', h)
      rect.setAttribute('fill', color)
      rect.setAttribute('opacity', isSel ? '0.35' : '0.12')
      rect.setAttribute('stroke', isSel ? '#111827' : 'none')
      rect.setAttribute('stroke-width', isSel ? '2' : '0')
      rect.style.pointerEvents = 'visiblePainted'

      g.addEventListener('click', (e) => {
        e.stopPropagation()
        onSelectParcel(parcels[0])
      })
      g.addEventListener('mouseenter', () => {
        rect.setAttribute('opacity', isSel ? '0.45' : '0.2')
      })
      g.addEventListener('mouseleave', () => {
        rect.setAttribute('opacity', isSel ? '0.35' : '0.12')
      })

      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title')
      const avgScore = parcels.reduce((sum, p) => sum + (p.best_score ?? 0), 0) / parcels.length
      title.textContent = `${CROP_LABELS[rec] ?? rec} • ${avgScore.toFixed(1)}%`
      title.style.pointerEvents = 'none'

      g.appendChild(rect)
      g.appendChild(title)
      svg.appendChild(g)
    })

    const overlay = L.svgOverlay(svg, bounds)
    overlay.addTo(map)
    layerRef.current = overlay

    return () => {
      if (layerRef.current && map.hasLayer(layerRef.current)) {
        map.removeLayer(layerRef.current)
      }
    }
  }, [map, scores, selectedParcel, onSelectParcel])

  return null
}

function SearchLayer({ searchPoint, searchResult }) {
  const map = useMap()

  useEffect(() => {
    if (searchPoint) {
      map.flyTo([searchPoint.lat, searchPoint.lon], Math.max(map.getZoom(), 12), { animate: true, duration: 1 })
    }
  }, [searchPoint, map])

  if (!searchPoint) return null

  return (
    <>
      {/* Line from search point to nearest parcel */}
      {searchResult && (
        <Polyline
          positions={[
            [searchPoint.lat, searchPoint.lon],
            [searchResult.parcel.lat, searchResult.parcel.lon],
          ]}
          pathOptions={{ color: '#f59e0b', weight: 2, dashArray: '6 4', opacity: 0.8 }}
        />
      )}

      {/* Search pin */}
      <CircleMarker
        center={[searchPoint.lat, searchPoint.lon]}
        radius={8}
        pathOptions={{ color: '#fff', fillColor: '#f59e0b', fillOpacity: 1, weight: 2.5 }}
      >
        <Tooltip direction="top" offset={[0, -12]} permanent={false} opacity={0.95}>
          <div style={{ minWidth: 120 }}>
            <div className="font-semibold text-amber-600">📍 Search point</div>
            <div className="text-stone-500 text-[11px]">{searchPoint.label}</div>
            {searchResult && (
              <div className="text-stone-400 text-[10px] mt-0.5">
                {searchResult.distanceKm < 1
                  ? `${(searchResult.distanceKm * 1000).toFixed(0)} m to nearest`
                  : `${searchResult.distanceKm.toFixed(2)} km to nearest`}
              </div>
            )}
          </div>
        </Tooltip>
      </CircleMarker>
    </>
  )
}

export default function ParcelMap({ scores, selectedParcel, onSelectParcel, onDeselect, region, searchPoint, searchResult }) {
  const cfg = REGION_CONFIG[region]

  return (
    <MapContainer
      center={cfg.center}
      zoom={cfg.zoom}
      className="h-full w-full"
      zoomControl
    >
      <MapController region={region} />

      <TileLayer
        attribution='&copy; <a href="https://carto.com">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={20}
      />

      <GridLayer scores={scores} selectedParcel={selectedParcel} onSelectParcel={onSelectParcel} />
      <SearchLayer searchPoint={searchPoint} searchResult={searchResult} />
    </MapContainer>
  )
}
