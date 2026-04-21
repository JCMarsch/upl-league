import { describe, it, expect } from 'vitest'

describe('Health check', () => {
  it('API health endpoint mock returns ok status', async () => {
    const response = await fetch('/health')
    const data = await response.json()
    expect(data.status).toBe('ok')
    expect(data.service).toBe('upl-api')
  })
})
