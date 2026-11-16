export type ServiceProvider = 'cloudflare' | 'supabase'

/** Resolve only routes that are explicitly owned by a provider. */
export function serviceProviderFromPath(path: string): ServiceProvider | null {
  if (path === '/api/services/cloudflare/connect') return 'cloudflare'
  if (path === '/api/services/supabase/connect' || path === '/api/services/supabase/metrics-token')
    return 'supabase'
  return null
}
