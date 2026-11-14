import PkmsClientApp from '@pkms/client/PkmsClientApp'

export function meta() {
  return [{ title: 'PKMS — Markdown workspace' }]
}

export default function HomeRoute(): React.JSX.Element {
  return <PkmsClientApp />
}
