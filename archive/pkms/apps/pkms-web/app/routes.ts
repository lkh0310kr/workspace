import { index, route } from '@react-router/dev/routes'

export default [
  index('routes/index.tsx'),
  route('pkms-google-drive', 'routes/pkms-google-drive.tsx'),
  route('existing-pkms', 'routes/existing-pkms.tsx'),
  route('privacy', 'routes/privacy.tsx'),
  route('terms', 'routes/terms.tsx'),
  route('*', 'routes/home.tsx'),
  route('health', 'routes/health.ts')
]
