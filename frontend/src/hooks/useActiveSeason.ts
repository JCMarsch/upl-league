import { useState, useEffect } from 'react'
import axios from 'axios'

interface Season {
  id: number
  name: string
  status: string
  year: number
}

const ACTIVE_STATUSES = ['draft', 'regular', 'playoffs']

export function useActiveSeason() {
  const [seasonId, setSeasonId] = useState<number | null>(null)
  const [seasons, setSeasons] = useState<Season[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get('/seasons')
      .then((r) => {
        const all: Season[] = r.data
        setSeasons(all)
        if (all.length === 0) return
        const active = all.find((s) => ACTIVE_STATUSES.includes(s.status))
        const picked = active ?? all[all.length - 1]
        setSeasonId(picked.id)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return { seasonId, setSeasonId, seasons, loading }
}
