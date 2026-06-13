'use client'

import { useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'

type KimpRow = {
  id: number
  created_at: string
  kimp: number
  upbit_price: number | null
  exchange_rate: number | null
}

export default function KimpChart() {
  const [data, setData] = useState<KimpRow[]>([])

  useEffect(() => {
    fetch('/api/kimp-history')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setData(
            json.data
              .filter((row: KimpRow) => row.kimp !== null)
              .map((row: KimpRow) => ({
                ...row,
                time: new Date(row.created_at).toLocaleTimeString('ko-KR', {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
                kimp: Number(row.kimp.toFixed(3)),
              }))
          )
        }
      })
  }, [])

  return (
    <div style={{ width: '100%', height: 320 }}>
      <h2>테더 김프 차트</h2>
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" />
          <YAxis unit="%" />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="kimp"
            name="USDT 김프"
            strokeWidth={2}
            dot={true}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}