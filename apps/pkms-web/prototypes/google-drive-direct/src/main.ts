import './style.css'

type DriveFile = {
  id: string
  name: string
  mimeType: string
  parents?: string[]
  modifiedTime?: string
  md5Checksum?: string
  size?: string
  webViewLink?: string
  trashed?: boolean
}

type DriveList = { files?: DriveFile[]; nextPageToken?: string }
type DriveChange = {
  fileId: string
  removed?: boolean
  file?: Pick<DriveFile, 'id' | 'name' | 'mimeType' | 'parents' | 'modifiedTime' | 'md5Checksum' | 'trashed'>
}
type ChangePage = {
  changes?: DriveChange[]
  nextPageToken?: string
  newStartPageToken?: string
}
type Token = { accessToken: string; expiresAt: number; expiresIn: number }
type Breadcrumb = { id: string; name: string }

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const ROOT_NAME = 'Workspace Drive Prototype'
const ROOT_ID_KEY = 'workspace-drive-direct-prototype-root'
const CLIENT_ID_KEY = 'workspace-drive-direct-prototype-client-id'
const CURSOR_KEY_PREFIX = 'workspace-drive-direct-prototype-cursor:'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const CONFIGURED_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

const getElement = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing UI element: ${id}`)
  return element as T
}

const clientIdInput = getElement<HTMLInputElement>('client-id')
const connectButton = getElement<HTMLButtonElement>('connect-button')
const tokenState = getElement<HTMLSpanElement>('token-state')
const tokenCountdown = getElement<HTMLElement>('token-countdown')
const tokenIssued = getElement<HTMLSpanElement>('token-issued')
const rootButton = getElement<HTMLButtonElement>('root-button')
const rootLabel = getElement<HTMLParagraphElement>('root-label')
const backButton = getElement<HTMLButtonElement>('back-button')
const refreshButton = getElement<HTMLButtonElement>('refresh-button')
const createFolderButton = getElement<HTMLButtonElement>('create-folder-button')
const createNoteButton = getElement<HTMLButtonElement>('create-note-button')
const changesButton = getElement<HTMLButtonElement>('changes-button')
const openDriveButton = getElement<HTMLButtonElement>('open-drive-button')
const breadcrumb = getElement<HTMLDivElement>('breadcrumb')
const fileRows = getElement<HTMLTableSectionElement>('file-rows')
const selectedFileLabel = getElement<HTMLParagraphElement>('selected-file')
const editor = getElement<HTMLTextAreaElement>('editor')
const saveButton = getElement<HTMLButtonElement>('save-button')
const renameButton = getElement<HTMLButtonElement>('rename-button')
const trashButton = getElement<HTMLButtonElement>('trash-button')
const eventLog = getElement<HTMLOListElement>('event-log')
const clearLogButton = getElement<HTMLButtonElement>('clear-log-button')

let token: Token | null = null
let tokenTimer: number | undefined
let rootFolder: DriveFile | null = null
let currentFolder: DriveFile | null = null
let pathStack: Breadcrumb[] = []
let selectedFile: DriveFile | null = null
let selectedBaseline: Pick<DriveFile, 'modifiedTime' | 'md5Checksum'> | null = null
let rootWebViewLink: string | undefined

function log(message: string, level: 'info' | 'error' = 'info'): void {
  const item = document.createElement('li')
  const timestamp = new Date().toLocaleTimeString()
  item.textContent = `[${timestamp}] ${message}`
  if (level === 'error') item.dataset.level = 'error'
  eventLog.prepend(item)
}

function updateControls(): void {
  const connected = Boolean(token && token.expiresAt > Date.now())
  connectButton.disabled = false
  const hasFolder = Boolean(rootFolder && currentFolder)
  rootButton.disabled = !connected
  backButton.disabled = !connected || pathStack.length === 0
  refreshButton.disabled = !connected || !hasFolder
  createFolderButton.disabled = !connected || !hasFolder
  createNoteButton.disabled = !connected || !hasFolder
  changesButton.disabled = !connected || !rootFolder
  openDriveButton.disabled = !rootWebViewLink
  saveButton.disabled = !connected || !selectedFile || selectedFile.mimeType === FOLDER_MIME
  renameButton.disabled = !connected || !selectedFile
  trashButton.disabled = !connected || !selectedFile
  if (connected) {
    tokenState.textContent = '연결됨'
    tokenState.classList.add('connected')
  } else {
    tokenState.textContent = '연결 안 됨'
    tokenState.classList.remove('connected')
  }
}

function expireToken(reason: string): void {
  token = null
  if (tokenTimer !== undefined) window.clearInterval(tokenTimer)
  tokenTimer = undefined
  tokenCountdown.textContent = '만료됨'
  tokenIssued.textContent = reason
  updateControls()
  log(reason, 'error')
}

function startTokenCountdown(response: GoogleTokenResponse): void {
  const seconds = Number(response.expires_in)
  if (!Number.isFinite(seconds) || seconds <= 0) {
    expireToken('Google 응답에 유효한 expires_in이 없습니다. 다시 연결하세요.')
    return
  }
  token = { accessToken: response.access_token!, expiresAt: Date.now() + seconds * 1000, expiresIn: seconds }
  if (tokenTimer !== undefined) window.clearInterval(tokenTimer)
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((token!.expiresAt - Date.now()) / 1000))
    const minutes = Math.floor(remaining / 60)
    const secondsLeft = remaining % 60
    tokenCountdown.textContent = `${remaining}s (${minutes}m ${String(secondsLeft).padStart(2, '0')}s)`
    if (remaining <= 0) expireToken('Access token이 만료됐습니다. Google Drive 연결을 다시 눌러 주세요.')
  }
  tokenIssued.textContent = `Google 응답 expires_in=${seconds}s · ${new Date(token.expiresAt).toLocaleTimeString()} 만료 예정`
  tick()
  tokenTimer = window.setInterval(tick, 1000)
  updateControls()
  log(`Google OAuth access token 발급. expires_in=${seconds}s, scope=${response.scope ?? '(응답 scope 없음)'}`)
}

async function connectToGoogle(): Promise<void> {
  const clientId = clientIdInput.value.trim()
  if (!clientId.endsWith('.apps.googleusercontent.com')) {
    log('Web client ID 형식을 확인하세요. client secret은 입력하지 마세요.', 'error')
    clientIdInput.focus()
    return
  }
  if (!window.google?.accounts.oauth2) {
    log('Google Identity Services가 아직 로드되지 않았습니다. 잠시 후 다시 눌러 주세요.', 'error')
    return
  }
  localStorage.setItem(CLIENT_ID_KEY, clientId)
  try {
    await new Promise<void>((resolve, reject) => {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_FILE_SCOPE,
        callback: (response) => {
          if (response.error || !response.access_token) {
            reject(new Error(response.error_description ?? response.error ?? 'Google token response did not include an access token'))
            return
          }
          startTokenCountdown(response)
          resolve()
        },
        error_callback: (error) => reject(new Error(error.message ?? error.type ?? 'Google authorization popup failed'))
      })
      // GIS token model: no redirect URI, no refresh token, and renewal starts from this user click.
      client.requestAccessToken({ prompt: '' })
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google authorization failed'
    log(message, 'error')
  }
}

function requireToken(): Token {
  if (!token || token.expiresAt <= Date.now()) {
    expireToken('Access token이 없거나 만료됐습니다. Google Drive 연결을 다시 눌러 주세요.')
    throw new Error('Google Drive access token is unavailable')
  }
  return token
}

async function driveRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const currentToken = requireToken()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${currentToken.accessToken}`)
  if (init.body && typeof init.body === 'string' && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json')
  const response = await fetch(`${DRIVE_API}${path}`, { ...init, headers })
  if (response.status === 401) {
    expireToken('Google Drive가 token을 거부했습니다. 다시 연결하세요.')
    throw new Error('Google Drive authorization expired')
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: { message?: string; errors?: Array<{ reason?: string }> } }
    const reason = body.error?.errors?.[0]?.reason
    const detail = body.error?.message ?? `HTTP ${response.status}`
    throw new Error(`Drive API ${response.status}${reason ? ` ${reason}` : ''}: ${detail}`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

async function driveMedia(path: string): Promise<string> {
  const currentToken = requireToken()
  const response = await fetch(`${DRIVE_API}${path}`, {
    headers: { Authorization: `Bearer ${currentToken.accessToken}` }
  })
  if (response.status === 401) {
    expireToken('Google Drive가 token을 거부했습니다. 다시 연결하세요.')
    throw new Error('Google Drive authorization expired')
  }
  if (!response.ok) throw new Error(`Drive download failed (${response.status})`)
  return response.text()
}

async function uploadMedia(fileId: string, content: string): Promise<DriveFile> {
  const currentToken = requireToken()
  const response = await fetch(`${UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${currentToken.accessToken}`,
      'Content-Type': 'text/markdown; charset=utf-8'
    },
    body: content
  })
  if (response.status === 401) {
    expireToken('Google Drive가 token을 거부했습니다. 다시 연결하세요.')
    throw new Error('Google Drive authorization expired')
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(`Drive upload failed (${response.status}): ${body.error?.message ?? 'unknown error'}`)
  }
  return response.json() as Promise<DriveFile>
}

async function getFile(fileId: string): Promise<DriveFile> {
  return driveRequest<DriveFile>(`/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,parents,modifiedTime,md5Checksum,size,webViewLink,trashed`)
}

async function listChildren(parentId: string): Promise<DriveFile[]> {
  const query = `'${parentId.replaceAll("'", "\\'")}' in parents and trashed = false`
  const files: DriveFile[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({
      q: query,
      orderBy: 'folder,name',
      pageSize: '1000',
      fields: 'nextPageToken,files(id,name,mimeType,parents,modifiedTime,md5Checksum,size,webViewLink,trashed)'
    })
    if (pageToken) params.set('pageToken', pageToken)
    const page = await driveRequest<DriveList>(`/files?${params.toString()}`)
    files.push(...(page.files ?? []))
    pageToken = page.nextPageToken
  } while (pageToken)
  return files.sort((a, b) => {
    if (a.mimeType === FOLDER_MIME && b.mimeType !== FOLDER_MIME) return -1
    if (a.mimeType !== FOLDER_MIME && b.mimeType === FOLDER_MIME) return 1
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  })
}

async function findOrCreateRoot(): Promise<void> {
  const existingId = localStorage.getItem(ROOT_ID_KEY)
  if (existingId) {
    try {
      rootFolder = await getFile(existingId)
      if (rootFolder.trashed || rootFolder.mimeType !== FOLDER_MIME) rootFolder = null
    } catch {
      rootFolder = null
    }
  }
  if (!rootFolder) {
    const params = new URLSearchParams({
      q: `name = '${ROOT_NAME}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
      pageSize: '100',
      fields: 'files(id,name,mimeType,webViewLink)'
    })
    const found = await driveRequest<DriveList>(`/files?${params.toString()}`)
    const matching = found.files ?? []
    if (matching.length > 1) {
      log(`동일 이름 prototype 폴더가 ${matching.length}개 있습니다. 가장 최근 로컬 연결 ID를 사용합니다.`, 'error')
    }
    rootFolder = matching[0] ?? null
  }
  if (!rootFolder) {
    rootFolder = await driveRequest<DriveFile>('/files?fields=id,name,mimeType,webViewLink', {
      method: 'POST',
      body: JSON.stringify({ name: ROOT_NAME, mimeType: FOLDER_MIME })
    })
    log(`전용 테스트 폴더 생성: ${ROOT_NAME}`)
  }
  localStorage.setItem(ROOT_ID_KEY, rootFolder.id)
  rootWebViewLink = rootFolder.webViewLink
  currentFolder = rootFolder
  pathStack = []
  rootLabel.textContent = `${rootFolder.name} · Drive file ID ${rootFolder.id}`
  log(`Prototype 폴더 연결 완료: ${rootFolder.id}`)
  updateControls()
  await renderCurrentFolder()
}

function formatTime(value?: string): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString()
}

function renderBreadcrumb(): void {
  const labels = [ROOT_NAME, ...pathStack.map((item) => item.name)]
  breadcrumb.textContent = labels.join(' / ')
}

async function renderCurrentFolder(): Promise<void> {
  if (!currentFolder) return
  renderBreadcrumb()
  const files = await listChildren(currentFolder.id)
  fileRows.replaceChildren()
  if (!files.length) {
    const row = document.createElement('tr')
    const cell = document.createElement('td')
    cell.colSpan = 5
    cell.className = 'empty'
    cell.textContent = '이 폴더는 비어 있습니다.'
    row.append(cell)
    fileRows.append(row)
    return
  }
  for (const file of files) {
    const row = document.createElement('tr')
    const nameCell = document.createElement('td')
    nameCell.className = 'name-cell'
    const openButton = document.createElement('button')
    openButton.className = 'name-action'
    openButton.textContent = file.mimeType === FOLDER_MIME ? `📁 ${file.name}` : file.name
    openButton.addEventListener('click', () => {
      if (file.mimeType === FOLDER_MIME) void openFolder(file)
      else if (file.mimeType === 'text/markdown' || file.name.toLowerCase().endsWith('.md')) void openDocument(file)
      else selectAsset(file)
    })
    nameCell.append(openButton)
    const typeCell = document.createElement('td')
    typeCell.textContent = file.mimeType === FOLDER_MIME ? 'Folder' : file.mimeType
    const timeCell = document.createElement('td')
    timeCell.textContent = formatTime(file.modifiedTime)
    const stateCell = document.createElement('td')
    stateCell.textContent = selectedFile?.id === file.id ? '선택됨' : '—'
    const actionCell = document.createElement('td')
    const selectButton = document.createElement('button')
    selectButton.textContent = '선택'
    selectButton.addEventListener('click', () => selectItem(file))
    actionCell.append(selectButton)
    row.append(nameCell, typeCell, timeCell, stateCell, actionCell)
    fileRows.append(row)
  }
  updateControls()
}

async function openFolder(folder: DriveFile): Promise<void> {
  if (!currentFolder) return
  pathStack.push({ id: currentFolder.id, name: folder.name })
  currentFolder = folder
  selectedFile = null
  selectedBaseline = null
  editor.value = ''
  editor.disabled = true
  selectedFileLabel.textContent = '폴더를 탐색 중입니다.'
  await renderCurrentFolder()
}

async function selectItem(file: DriveFile): Promise<void> {
  selectedFile = file
  selectedBaseline = null
  selectedFileLabel.textContent = `${file.name} · ${file.id}`
  const isMarkdown = file.mimeType === 'text/markdown' || file.name.toLowerCase().endsWith('.md')
  editor.disabled = !isMarkdown
  editor.value = ''
  updateControls()
  await renderCurrentFolder()
}

async function openDocument(file: DriveFile): Promise<void> {
  await selectItem(file)
  const [metadata, content] = await Promise.all([
    getFile(file.id),
    driveMedia(`/files/${encodeURIComponent(file.id)}?alt=media`)
  ])
  selectedFile = metadata
  selectedBaseline = { modifiedTime: metadata.modifiedTime, md5Checksum: metadata.md5Checksum }
  editor.disabled = false
  editor.value = content
  selectedFileLabel.textContent = `${metadata.name} · ${metadata.id} · ${metadata.md5Checksum ?? 'checksum unavailable'}`
  updateControls()
  log(`Markdown 읽기 완료: ${metadata.name}, ${new TextEncoder().encode(content).length} bytes`)
}

function selectAsset(file: DriveFile): void {
  selectedFile = file
  selectedBaseline = { modifiedTime: file.modifiedTime, md5Checksum: file.md5Checksum }
  editor.value = ''
  editor.disabled = true
  selectedFileLabel.textContent = `${file.name} · binary asset · ${file.size ?? 'size unknown'} bytes`
  updateControls()
  void renderCurrentFolder()
}

async function createFolder(): Promise<void> {
  if (!currentFolder) return
  const name = prompt('하위 폴더 이름', 'prototype-folder')?.trim()
  if (!name) return
  await driveRequest<DriveFile>('/files?fields=id,name,mimeType,parents,modifiedTime,webViewLink', {
    method: 'POST',
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [currentFolder.id] })
  })
  log(`하위 폴더 생성: ${name}`)
  await renderCurrentFolder()
}

async function createNote(content = '# Drive prototype\n\nCreated directly from the browser.\n'): Promise<DriveFile> {
  if (!currentFolder) throw new Error('Prototype folder is not connected')
  const name = `drive-prototype-${new Date().toISOString().replaceAll(':', '-')}.md`
  const created = await driveRequest<DriveFile>('/files?fields=id,name,mimeType,parents,modifiedTime,webViewLink', {
    method: 'POST',
    body: JSON.stringify({ name, mimeType: 'text/markdown', parents: [currentFolder.id] })
  })
  const uploaded = await uploadMedia(created.id, content)
  log(`Markdown 생성·upload 완료: ${name} (${new TextEncoder().encode(content).length} bytes)`)
  return { ...created, ...uploaded, name }
}

async function saveCurrentDocument(): Promise<void> {
  if (!selectedFile || !selectedBaseline || selectedFile.mimeType === FOLDER_MIME) return
  const localContent = editor.value
  const current = await getFile(selectedFile.id)
  if (current.md5Checksum !== selectedBaseline.md5Checksum || current.modifiedTime !== selectedBaseline.modifiedTime) {
    const name = `${selectedFile.name.replace(/\.md$/i, '')}.conflict-${new Date().toISOString().replaceAll(':', '-')}.md`
    const originalFolder = selectedFile.parents?.[0] ?? rootFolder?.id
    if (!originalFolder) throw new Error('Cannot locate the note parent folder for conflict preservation')
    const copy = await driveRequest<DriveFile>('/files?fields=id,name,mimeType,parents,modifiedTime', {
      method: 'POST',
      body: JSON.stringify({ name, mimeType: 'text/markdown', parents: [originalFolder] })
    })
    await uploadMedia(copy.id, localContent)
    log(`Remote note가 달라져 overwrite를 막았습니다. 편집본을 conflict copy로 보존: ${name}`, 'error')
    await renderCurrentFolder()
    return
  }
  const result = await uploadMedia(selectedFile.id, localContent)
  selectedFile = { ...selectedFile, ...result }
  const refreshed = await getFile(selectedFile.id)
  selectedFile = refreshed
  selectedBaseline = { modifiedTime: refreshed.modifiedTime, md5Checksum: refreshed.md5Checksum }
  selectedFileLabel.textContent = `${refreshed.name} · ${refreshed.id} · ${refreshed.md5Checksum ?? 'checksum unavailable'}`
  log(`Drive 저장 및 metadata 재조회 완료: ${refreshed.name} · ${refreshed.md5Checksum ?? 'checksum unavailable'}`)
  await renderCurrentFolder()
}

async function renameSelected(): Promise<void> {
  if (!selectedFile) return
  const name = prompt('새 파일 이름', selectedFile.name)?.trim()
  if (!name || name === selectedFile.name) return
  const result = await driveRequest<DriveFile>(`/files/${encodeURIComponent(selectedFile.id)}?fields=id,name,mimeType,parents,modifiedTime,md5Checksum,webViewLink`, {
    method: 'PATCH',
    body: JSON.stringify({ name })
  })
  selectedFile = { ...selectedFile, ...result }
  selectedFileLabel.textContent = `${result.name} · ${result.id}`
  log(`Drive item rename 완료: ${name}`)
  await renderCurrentFolder()
}

async function trashSelected(): Promise<void> {
  if (!selectedFile) return
  if (!confirm(`"${selectedFile.name}"을 Google Drive 휴지통으로 옮길까요?`)) return
  const oldName = selectedFile.name
  await driveRequest(`/files/${encodeURIComponent(selectedFile.id)}?fields=id,trashed`, {
    method: 'PATCH',
    body: JSON.stringify({ trashed: true })
  })
  selectedFile = null
  selectedBaseline = null
  editor.value = ''
  editor.disabled = true
  selectedFileLabel.textContent = '선택된 파일이 없습니다.'
  log(`Drive 휴지통으로 이동: ${oldName}`)
  updateControls()
  await renderCurrentFolder()
}

async function initializeCursor(): Promise<string> {
  const response = await driveRequest<{ startPageToken: string }>('/changes/startPageToken?fields=startPageToken')
  if (!rootFolder) throw new Error('Connect the prototype folder before saving a change cursor')
  localStorage.setItem(`${CURSOR_KEY_PREFIX}${rootFolder.id}`, response.startPageToken)
  log('Drive change cursor 초기화. 이 시점 이후 변경부터 확인합니다.')
  return response.startPageToken
}

async function pollChanges(): Promise<void> {
  if (!rootFolder) return
  let committedToken = localStorage.getItem(`${CURSOR_KEY_PREFIX}${rootFolder.id}`)
  if (!committedToken) committedToken = await initializeCursor()
  let requestToken = committedToken
  const changes: DriveChange[] = []
  let finalToken: string | undefined
  let pages = 0
  do {
    const params = new URLSearchParams({
      pageToken: requestToken,
      pageSize: '100',
      includeRemoved: 'true',
      fields: 'nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,parents,modifiedTime,md5Checksum,trashed))'
    })
    const page = await driveRequest<ChangePage>(`/changes?${params.toString()}`)
    pages += 1
    changes.push(...(page.changes ?? []))
    if (page.nextPageToken) requestToken = page.nextPageToken
    else {
      finalToken = page.newStartPageToken
      break
    }
  } while (pages < 100)
  if (!finalToken) throw new Error(`Change feed did not reach its final page after ${pages} pages; committed cursor was not advanced`)
  localStorage.setItem(`${CURSOR_KEY_PREFIX}${rootFolder.id}`, finalToken)
  log(`Drive change feed ${pages} page(s), ${changes.length} change(s). Final cursor만 저장했습니다.`)
  for (const change of changes.slice(-20)) {
    const label = change.removed ? `removed ${change.fileId}` : `${change.file?.name ?? change.fileId} (${change.file?.mimeType ?? 'file'})`
    log(`Change: ${label}`)
  }
  await renderCurrentFolder()
}

async function showDriveFolder(): Promise<void> {
  if (rootWebViewLink) window.open(rootWebViewLink, '_blank', 'noopener,noreferrer')
  else if (rootFolder) {
    const metadata = await getFile(rootFolder.id)
    rootWebViewLink = metadata.webViewLink
    if (rootWebViewLink) window.open(rootWebViewLink, '_blank', 'noopener,noreferrer')
  }
}

function withBusy<T extends HTMLButtonElement>(button: T, work: () => Promise<void>): () => void {
  return () => {
    if (button.disabled) return
    button.disabled = true
    void work().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      log(message, 'error')
    }).finally(() => updateControls())
  }
}

clientIdInput.value = localStorage.getItem(CLIENT_ID_KEY) ?? CONFIGURED_CLIENT_ID ?? ''
connectButton.addEventListener('click', withBusy(connectButton, connectToGoogle))
rootButton.addEventListener('click', withBusy(rootButton, findOrCreateRoot))
refreshButton.addEventListener('click', withBusy(refreshButton, renderCurrentFolder))
createFolderButton.addEventListener('click', withBusy(createFolderButton, createFolder))
createNoteButton.addEventListener('click', withBusy(createNoteButton, async () => {
  const file = await createNote()
  await renderCurrentFolder()
  await openDocument(file)
}))
changesButton.addEventListener('click', withBusy(changesButton, pollChanges))
openDriveButton.addEventListener('click', withBusy(openDriveButton, showDriveFolder))
saveButton.addEventListener('click', withBusy(saveButton, saveCurrentDocument))
renameButton.addEventListener('click', withBusy(renameButton, renameSelected))
trashButton.addEventListener('click', withBusy(trashButton, trashSelected))
backButton.addEventListener('click', withBusy(backButton, async () => {
  const previous = pathStack.pop()
  if (!previous) return
  currentFolder = await getFile(previous.id)
  selectedFile = null
  selectedBaseline = null
  editor.value = ''
  editor.disabled = true
  selectedFileLabel.textContent = 'Markdown 파일을 선택하세요.'
  await renderCurrentFolder()
}))
clearLogButton.addEventListener('click', () => eventLog.replaceChildren())
clientIdInput.addEventListener('change', () => {
  const value = clientIdInput.value.trim()
  if (value) localStorage.setItem(CLIENT_ID_KEY, value)
  else localStorage.removeItem(CLIENT_ID_KEY)
})

updateControls()
log('준비 완료. Client ID를 입력하고 Google Drive 연결을 누르세요.')
