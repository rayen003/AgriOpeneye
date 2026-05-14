import {
  BarChart, Bar, XAxis, YAxis, Cell,
  Tooltip, LabelList, ResponsiveContainer,
} from 'recharts'
import { CROP_COLORS, CROP_LABELS, TARGET_CROPS } from '../constants.js'

export default function ScoreChart({ parcel }) {
  const data = TARGET_CROPS
    .map(crop => ({
      crop,
      label: CROP_LABELS[crop],
      score: parseFloat((parcel[`score_${crop}`] ?? 0).toFixed(1)),
      color: CROP_COLORS[crop],
    }))
    .sort((a, b) => b.score - a.score)

  return (
    <ResponsiveContainer width="100%" height={138}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 44, top: 0, bottom: 0 }}>
        <XAxis type="number" domain={[0, 100]} hide />
        <YAxis
          type="category"
          dataKey="label"
          width={88}
          tick={{ fontSize: 12, fill: '#78716c' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          formatter={v => [`${v.toFixed(1)}%`, 'Score']}
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: '1px solid #e7e5e4',
            padding: '4px 10px',
          }}
          cursor={{ fill: '#f5f5f4' }}
        />
        <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={16}>
          {data.map(d => <Cell key={d.crop} fill={d.color} />)}
          <LabelList
            dataKey="score"
            position="right"
            formatter={v => `${v.toFixed(1)}%`}
            style={{ fontSize: 11, fill: '#78716c' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
