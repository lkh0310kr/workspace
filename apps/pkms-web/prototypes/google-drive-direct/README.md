# Google Drive direct prototype

Static browser prototype for direct Google Drive API v3 access. It has no application backend and does not call the PKMS Worker, PKMS Server, Supabase, or GitHub. It creates data only inside a `Workspace Drive Prototype` folder after the user presses the create/connect button.

## Get a Web client ID

1. Open [Google Cloud Console OAuth clients](https://console.cloud.google.com/auth/clients) and select or create a project.
2. Enable **Google Drive API** for that project.
3. Configure Google Auth Platform audience as **External / Testing** and add your Google account as a test user.
4. Create an OAuth client with application type **Web application**.
5. Add the Authorized JavaScript origin `http://localhost:4173`. No redirect URI is needed for GIS token model.
6. Add only the Drive scope `https://www.googleapis.com/auth/drive.file` to Data Access. Do not use the OAuth client secret in this prototype.
7. Copy the client ID ending in `.apps.googleusercontent.com`.

The Web client ID is a public identifier. The app stores it in this browser's localStorage for convenience; this is not an access token. OAuth authorization uses Google's popup/dialog flow. Google requires localhost origins including their port to be registered for local testing. See [Google: Get a client ID](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid).

## Run

From the repository root:

```sh
npm run drive:prototype --workspace @pkms/web
```

Open `http://localhost:4173`, paste the Web client ID, and connect Google Drive. The Vite server only serves static development files; it is not an OAuth/API backend. Production Web deployment will still need a static hosting origin registered with Google.

## Experiments

- Connect with `drive.file`; the access token remains in JavaScript memory only.
- The countdown uses the response's actual `expires_in` value. Expiration requires clicking **Google Drive 연결** again; there is no server-side or automatic refresh token.
- Create a Drive-visible prototype root, folders, and Markdown files; list, edit, rename, and trash them.
- Initialize and poll the Drive change feed. The saved start cursor advances only after every result page has been read.
- Saving an edited note re-reads Drive metadata/checksum. A changed file is preserved as a conflict copy instead of silently overwritten. This prototype preflight is not an atomic cross-device compare-and-swap.

External/Testing OAuth grants using Drive scopes expire after 7 days, even though each individual access token has a much shorter lifetime. This lets us test revocation/reconsent behavior but is not suitable for unattended permanent sync. Promote and verify the OAuth app before production background sync. See [Google OAuth token lifecycle](https://developers.google.com/identity/protocols/oauth2).

## Data cleanup

The UI's **휴지통으로** action moves a selected prototype item to Drive trash, which is recoverable. Do not use this folder for PKMS data. The app stores only the prototype root ID and per-root change cursor in localStorage; use **목록 새로고침** to fetch Drive's current state.
