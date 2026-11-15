import type { MetaFunction } from 'react-router'

export const meta: MetaFunction = () => [
  { title: 'Terms of Service — Workspace PKMS' },
  { name: 'description', content: 'Terms for using Workspace PKMS Google Drive integration.' }
]

export default function TermsOfService(): React.JSX.Element {
  return (
    <main style={{ maxWidth: 760, margin: '48px auto', padding: '0 24px', lineHeight: 1.65 }}>
      <a href="/">Workspace PKMS</a>
      <h1>Terms of Service</h1>
      <p>Effective date: November 15, 2026</p>
      <p>
        Workspace PKMS provides a Markdown editor and a direct Google Drive integration for
        organizing and synchronizing your files. By using the integration, you ask the app to
        access Google Drive files within the permissions you grant.
      </p>

      <h2>Your files and account</h2>
      <p>
        You retain responsibility for your Google account and the content you create, edit, move,
        or delete. You must have the rights needed to use that content and must follow Google’s
        applicable terms when using Google Drive. The app’s Drive permission is limited to files
        created by the app or explicitly opened with it.
      </p>

      <h2>Synchronization and availability</h2>
      <p>
        The app keeps a local cache and pending changes to support editing and recovery. You are
        responsible for maintaining any additional backups you need. Synchronization can be
        delayed or unavailable because of network, Google Drive, device, or service-provider
        conditions. Review conflict and sync status before relying on a change being available on
        another device.
      </p>

      <h2>Acceptable use and changes</h2>
      <p>
        Do not use the app to violate applicable law, interfere with the service, or access data
        without authorization. The app may be updated or discontinued. These terms may also be
        updated; the effective date above will change when they do.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms can be sent to
        <a href="mailto:lkh0310kr@gmail.com"> lkh0310kr@gmail.com</a>.
      </p>
    </main>
  )
}
