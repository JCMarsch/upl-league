import { http, HttpResponse } from 'msw'

export const handlers = [
  http.get('/health', () => {
    return HttpResponse.json({ status: 'ok', service: 'upl-api' })
  }),
  http.get('/seasons', () => {
    return HttpResponse.json([{ id: 1, name: 'Season 1', status: 'regular', year: 2025 }])
  }),
  http.get('/seasons/:id/standings', () => {
    return HttpResponse.json([])
  }),
  http.get('/seasons/:id/schedule', () => {
    return HttpResponse.json([])
  }),
  http.get('/seasons/:id/teams', () => {
    return HttpResponse.json([])
  }),
  http.get('/seasons/:id/pokemon', () => {
    return HttpResponse.json([])
  }),
  http.get('/seasons/:id/waivers', () => {
    return HttpResponse.json([])
  }),
  http.get('/seasons/:id/trades', () => {
    return HttpResponse.json([])
  }),
  http.get('/seasons/:id/waiver-order', () => {
    return HttpResponse.json([])
  }),
  http.get('/notifications', () => {
    return HttpResponse.json([])
  }),
  http.get('/notifications/unread-count', () => {
    return HttpResponse.json({ count: 0 })
  }),
  http.get('/history', () => {
    return HttpResponse.json([])
  }),
  http.get('/auth/me', () => {
    return HttpResponse.json(null, { status: 401 })
  }),
]
