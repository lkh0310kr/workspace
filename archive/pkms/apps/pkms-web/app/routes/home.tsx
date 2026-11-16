import PkmsGoogleDriveRoute from './pkms-google-drive'

export function meta() {
  return [{ title: 'PKMS Google Drive' }]
}

export default function HomeRoute(): React.JSX.Element {
  return <PkmsGoogleDriveRoute />
}
