import PkmsClientApp from '@pkms/client/PkmsClientApp'

export function meta() {
  return [{ title: 'PKMS — existing workspace' }]
}

export default function ExistingPkmsRoute(): React.JSX.Element {
  return <PkmsClientApp />
}
