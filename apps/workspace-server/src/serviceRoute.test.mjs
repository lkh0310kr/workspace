import assert from 'node:assert/strict'
import { test } from 'node:test'
import { serviceProviderFromPath } from './serviceRoute.ts'

test('resolves only declared Cloudflare and Supabase routes', () => {
  assert.equal(serviceProviderFromPath('/api/services/cloudflare/connect'), 'cloudflare')
  assert.equal(serviceProviderFromPath('/api/services/supabase/connect'), 'supabase')
  assert.equal(serviceProviderFromPath('/api/services/supabase/metrics-token'), 'supabase')
})

test('rejects provider-like paths that are not declared routes', () => {
  assert.equal(serviceProviderFromPath('/api/services/not-supabase/connect'), null)
  assert.equal(serviceProviderFromPath('/api/services/foo-cloudflare/connect'), null)
  assert.equal(serviceProviderFromPath('/api/services/supabase/foo/connect'), null)
  assert.equal(serviceProviderFromPath('/api/services/cloudflare/connect/'), null)
})
