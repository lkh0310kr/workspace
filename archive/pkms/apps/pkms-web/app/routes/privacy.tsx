import type { MetaFunction } from 'react-router'

export const meta: MetaFunction = () => [
  { title: 'Privacy Policy — Workspace PKMS' },
  { name: 'description', content: 'How Workspace PKMS handles Google account and Drive data.' }
]

export default function PrivacyPolicy(): React.JSX.Element {
  return (
    <main style={{ maxWidth: 760, margin: '48px auto', padding: '0 24px', lineHeight: 1.65 }}>
      <a href="/">Workspace PKMS</a>
      <h1>Privacy Policy</h1>
      <p>Effective date: November 15, 2026</p>
      <p>
        Workspace PKMS is a personal Markdown workspace that can store and synchronize files
        directly with your Google Drive. This notice describes the Google Drive integration at
        <a href="https://pkms-cloud.lkh0310kr.workers.dev/"> pkms-cloud.lkh0310kr.workers.dev</a>.
      </p>

      <h2>Google account information</h2>
      <p>
        When you connect Google Drive, the app receives an access token and asks Google for your
        email address so it can apply its configured account allowlist. The email address is used
        for that access check and is not written into PKMS documents. Web access tokens are kept
        in memory for the current page session. Desktop refresh credentials are protected using
        the operating system credential storage; access tokens are not exposed to the editor UI.
      </p>

      <h2>Google Drive files</h2>
      <p>
        The app requests the Google Drive <code>drive.file</code> permission. It uses this
        permission for files and folders created by this app or explicitly opened with it; it does
        not request general access to your entire Drive. File and folder changes are sent directly
        from the client to Google Drive. The app uses a local cache and durable pending-change
        queue on your device so work can be restored and synchronized. The cache may remain until
        you clear the app or browser data.
      </p>

      <h2>Service providers and retention</h2>
      <p>
        Google processes sign-in and Drive requests under Google’s privacy terms. Cloudflare
        serves the web application and may process standard connection and operational data needed
        to deliver and protect the service. PKMS does not send Drive document contents to its
        synchronization server in Google Drive mode. Your Drive files remain in your Google
        account until you delete them there. Local cached copies can be removed by clearing local
        app data.
      </p>

      <h2>Your choices and contact</h2>
      <p>
        You can disconnect or revoke the app’s access in your Google Account security settings,
        and can delete app files from Google Drive. For privacy questions, contact
        <a href="mailto:lkh0310kr@gmail.com"> lkh0310kr@gmail.com</a>.
      </p>
    </main>
  )
}
