import { http, HttpResponse } from 'msw'

export const handlers = [
  http.get('/health', () => {
    return HttpResponse.json({ status: 'ok', service: 'upl-api' })
  }),
  http.get('/seasons', () => {
    return HttpResponse.json([{ id: 1, name: 'Season 1', status: 'regular', year: 2025 }])
  }),
]
