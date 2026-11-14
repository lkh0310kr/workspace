import { index, route } from '@react-router/dev/routes'

export default [
  index('routes/index.tsx'),
  route('*', 'routes/home.tsx'),
  route('health', 'routes/health.ts')
]
