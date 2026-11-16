import { expect, test, type Page } from '@playwright/test'

type DriveRoot = { id: string; name: string; mimeType: string }
type DriveEntry = {
  id: string
  name: string
  mimeType: string
  parents: string[]
  path: string
  kind: 'folder' | 'markdown'
}
type CreateInput = [
  rootId: string,
  parentPath: string,
  kind: 'markdown' | 'folder',
  name: string,
  itemId?: string,
  parentItemId?: string
]
type DriveBridge = {
  listGoogleDriveWorkspaces: () => Promise<DriveRoot[]>
  connectGoogleDriveWorkspace: (
    rootId: string
  ) => Promise<{ root: DriveRoot; entries: DriveEntry[] }>
  listGoogleDriveDirectory: (rootId: string, parentId: string | null) => Promise<DriveEntry[]>
  syncGoogleDriveWorkspace: (rootId: string) => Promise<{ pendingOperations: number }>
  createGoogleDriveItem: (...args: CreateInput) => Promise<DriveEntry>
}
type TreeTestState = {
  directoryCalls: Array<{ rootId: string; parentId: string | null }>
  directoryGates: Array<{
    rootId: string
    parentId: string | null
    resolve: (entries: DriveEntry[]) => void
    reject: (reason?: unknown) => void
  }>
  gateDirectoryParentIds: Array<string | null>
  failDirectoryParentId: string | null
  failDirectoryCount: number
  syncCalls: Array<{ rootId: string }>
  syncGates: Array<{
    resolve: (result: { pendingOperations: number }) => void
    reject: (reason?: unknown) => void
  }>
  gateSync: boolean
  createCalls: CreateInput[]
  createGates: Array<{
    args: CreateInput
    resolve: (entry: DriveEntry) => void
    reject: (reason?: unknown) => void
  }>
  gateCreate: boolean
}
type TreeTestWindow = Window & {
  __driveTreeTest: TreeTestState
  pkmsDesktop: DriveBridge
}

async function installDriveControls(page: Page, multiRoot = false): Promise<void> {
  await page.addInitScript(
    ({ multiRoot: useMultipleRoots }) => {
      const rootA: DriveRoot = {
        id: 'race-root-a',
        name: 'Root A',
        mimeType: 'application/vnd.google-apps.folder'
      }
      const rootB: DriveRoot = {
        id: 'race-root-b',
        name: 'Root B',
        mimeType: 'application/vnd.google-apps.folder'
      }
      const folderA: DriveEntry = {
        id: 'race-folder-a',
        name: 'Old Folder',
        path: 'Old Folder',
        parents: [rootA.id],
        kind: 'folder',
        mimeType: 'application/vnd.google-apps.folder'
      }
      const folderB: DriveEntry = {
        id: 'race-folder-b',
        name: 'Current Folder',
        path: 'Current Folder',
        parents: [rootB.id],
        kind: 'folder',
        mimeType: 'application/vnd.google-apps.folder'
      }
      const state: TreeTestState = {
        directoryCalls: [],
        directoryGates: [],
        gateDirectoryParentIds: [],
        failDirectoryParentId: null,
        failDirectoryCount: 0,
        syncCalls: [],
        syncGates: [],
        gateSync: false,
        createCalls: [],
        createGates: [],
        gateCreate: false
      }
      ;(window as TreeTestWindow).__driveTreeTest = state
      Object.defineProperty(window, 'pkmsDesktop', {
        configurable: true,
        set(value: unknown) {
          const original = value as DriveBridge
          const listWorkspaces = original.listGoogleDriveWorkspaces
          const connectWorkspace = original.connectGoogleDriveWorkspace
          const listDirectory = original.listGoogleDriveDirectory
          const syncWorkspace = original.syncGoogleDriveWorkspace
          const createItem = original.createGoogleDriveItem
          const bridge = original as DriveBridge & Record<string, unknown>
          bridge.listGoogleDriveWorkspaces = () =>
            useMultipleRoots ? Promise.resolve([rootA, rootB]) : listWorkspaces()
          bridge.connectGoogleDriveWorkspace = (rootId: string) => {
            if (!useMultipleRoots) return connectWorkspace(rootId)
            const root = rootId === rootA.id ? rootA : rootB
            return Promise.resolve({ root, entries: [rootId === rootA.id ? folderA : folderB] })
          }
          bridge.listGoogleDriveDirectory = (rootId: string, parentId: string | null) => {
            state.directoryCalls.push({ rootId, parentId })
            if (state.failDirectoryParentId === parentId && state.failDirectoryCount > 0) {
              state.failDirectoryCount -= 1
              return Promise.reject(new Error('Warmed child listing failed'))
            }
            if (state.gateDirectoryParentIds.includes(parentId)) {
              return new Promise((resolve, reject) => {
                state.directoryGates.push({ rootId, parentId, resolve, reject })
              })
            }
            return listDirectory(rootId, parentId)
          }
          bridge.syncGoogleDriveWorkspace = (rootId: string) => {
            state.syncCalls.push({ rootId })
            if (state.gateSync) {
              return new Promise((resolve, reject) => state.syncGates.push({ resolve, reject }))
            }
            return syncWorkspace(rootId)
          }
          bridge.createGoogleDriveItem = (...args: CreateInput) => {
            state.createCalls.push(args)
            if (state.gateCreate) {
              return new Promise((resolve, reject) =>
                state.createGates.push({ args, resolve, reject })
              )
            }
            return createItem(...args)
          }
          Object.defineProperty(window, 'pkmsDesktop', {
            configurable: true,
            writable: true,
            value: bridge
          })
        }
      })
    },
    { multiRoot }
  )
}

async function pendingDirectoryCount(page: Page, parentId: string): Promise<number> {
  return page.evaluate(
    (id) =>
      (window as TreeTestWindow).__driveTreeTest.directoryCalls.filter(
        (call) => call.parentId === id
      ).length,
    parentId
  )
}

test('discards a delayed branch result after switching to another root', async ({ page }) => {
  await installDriveControls(page, true)
  await page.goto('/?host=desktop-pkms-editor')
  await page.getByRole('button', { name: 'Root A' }).click()
  await page.evaluate(() => {
    ;(window as TreeTestWindow).__driveTreeTest.gateDirectoryParentIds = ['race-folder-a']
  })
  await page.getByRole('treeitem', { name: 'Old Folder' }).click()
  await expect.poll(() => pendingDirectoryCount(page, 'race-folder-a')).toBe(1)
  await page.getByLabel('PKMS Google Drive workspace').selectOption('race-root-b')
  await expect(page.getByRole('treeitem', { name: 'Current Folder' })).toBeVisible()

  await page.evaluate(() => {
    const pending = (window as TreeTestWindow).__driveTreeTest.directoryGates[0]
    pending.resolve([
      {
        id: 'stale-old-root-row',
        name: 'Stale Old Root.md',
        path: 'Old Folder/Stale Old Root.md',
        parents: ['race-folder-a'],
        kind: 'markdown',
        mimeType: 'text/markdown'
      }
    ])
  })
  await expect(page.getByRole('treeitem', { name: 'Stale Old Root' })).toHaveCount(0)
  await expect(page.getByRole('treeitem', { name: 'Current Folder' })).toBeVisible()
})

test('keeps the newest same-path refresh and ignores the older response', async ({ page }) => {
  await installDriveControls(page)
  await page.goto('/?host=desktop-pkms-editor')
  const folder = page.getByRole('treeitem', { name: 'Verification' })
  await folder.click()
  const before = await pendingDirectoryCount(page, 'mock-verification-folder')
  await page.evaluate(() => {
    ;(window as TreeTestWindow).__driveTreeTest.gateDirectoryParentIds = [
      'mock-verification-folder'
    ]
  })

  await folder.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Sync now' }).click()
  await expect.poll(() => pendingDirectoryCount(page, 'mock-verification-folder')).toBe(before + 1)
  await folder.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Sync now' }).click()
  await expect.poll(() => pendingDirectoryCount(page, 'mock-verification-folder')).toBe(before + 2)

  await page.evaluate(() => {
    const pending = (window as TreeTestWindow).__driveTreeTest.directoryGates
    pending[1].resolve([
      {
        id: 'newest-refresh-row',
        name: 'Newest refresh.md',
        path: 'Verification/Newest refresh.md',
        parents: ['mock-verification-folder'],
        kind: 'markdown',
        mimeType: 'text/markdown'
      }
    ])
    pending[0].resolve([
      {
        id: 'older-refresh-row',
        name: 'Older refresh.md',
        path: 'Verification/Older refresh.md',
        parents: ['mock-verification-folder'],
        kind: 'markdown',
        mimeType: 'text/markdown'
      }
    ])
  })
  await expect(page.getByRole('treeitem', { name: 'Newest refresh' })).toBeVisible()
  await expect(page.getByRole('treeitem', { name: 'Older refresh' })).toHaveCount(0)
})

test('resumes a folder expansion deferred while workspace sync is in progress', async ({
  page
}) => {
  await installDriveControls(page)
  await page.goto('/?host=desktop-pkms-editor')
  const folder = page.getByRole('treeitem', { name: 'Verification' })
  await page.evaluate(() => {
    ;(window as TreeTestWindow).__driveTreeTest.gateSync = true
    ;(window as TreeTestWindow).__driveTreeTest.gateDirectoryParentIds = [
      'mock-verification-folder'
    ]
  })
  await page.getByRole('button', { name: 'Up to date' }).click()
  await expect
    .poll(() => page.evaluate(() => (window as TreeTestWindow).__driveTreeTest.syncGates.length))
    .toBe(1)
  await folder.click()
  expect(await pendingDirectoryCount(page, 'mock-verification-folder')).toBe(0)

  await page.evaluate(() => {
    ;(window as TreeTestWindow).__driveTreeTest.syncGates[0].resolve({ pendingOperations: 0 })
  })
  await expect.poll(() => pendingDirectoryCount(page, 'mock-verification-folder')).toBe(1)
  await page.evaluate(() => {
    ;(window as TreeTestWindow).__driveTreeTest.directoryGates[0].resolve([
      {
        id: 'deferred-child-row',
        name: 'Loaded after sync.md',
        path: 'Verification/Loaded after sync.md',
        parents: ['mock-verification-folder'],
        kind: 'markdown',
        mimeType: 'text/markdown'
      }
    ])
  })
  await expect(page.getByRole('treeitem', { name: 'Loaded after sync' })).toBeVisible()
})

test('preserves a pending optimistic create when a refresh misses it', async ({ page }) => {
  await installDriveControls(page)
  await page.goto('/?host=desktop-pkms-editor')
  await page.evaluate(() => {
    ;(window as TreeTestWindow).__driveTreeTest.gateCreate = true
    ;(window as TreeTestWindow).__driveTreeTest.gateDirectoryParentIds = [null]
  })
  await page.getByRole('button', { name: 'New folder' }).click()
  const name = page.getByRole('textbox', { name: 'New folder name' })
  await name.fill('Optimistic folder')
  await name.press('Enter')
  await expect(page.getByRole('treeitem', { name: 'Optimistic folder' })).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => (window as TreeTestWindow).__driveTreeTest.createGates.length))
    .toBe(1)

  await page.getByRole('treeitem', { name: 'Verification' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Sync now' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => (window as TreeTestWindow).__driveTreeTest.directoryGates.length)
    )
    .toBe(1)
  await page.evaluate(() => {
    ;(window as TreeTestWindow).__driveTreeTest.directoryGates[0].resolve([
      {
        id: 'mock-verification-folder',
        name: 'Verification',
        path: 'Verification',
        parents: ['mock-drive-root'],
        kind: 'folder',
        mimeType: 'application/vnd.google-apps.folder'
      }
    ])
  })
  await expect(page.getByRole('treeitem', { name: 'Optimistic folder' })).toBeVisible()

  await page.evaluate(() => {
    const state = (window as TreeTestWindow).__driveTreeTest
    const [, , kind, name, id, parentId] = state.createGates[0].args
    state.createGates[0].resolve({
      id,
      name,
      path: name,
      parents: [parentId],
      kind,
      mimeType: 'application/vnd.google-apps.folder'
    })
  })
  await expect(page.getByRole('treeitem', { name: 'Optimistic folder' })).toBeVisible()
})

test('allows retrying a child folder whose background warm load failed', async ({ page }) => {
  await installDriveControls(page)
  await page.goto('/?host=desktop-pkms-editor&scenario=quick-open-nested')
  await page.evaluate(() => {
    ;(window as TreeTestWindow).__driveTreeTest.failDirectoryParentId = 'mock-hidden-folder'
    ;(window as TreeTestWindow).__driveTreeTest.failDirectoryCount = 1
  })
  await page.getByRole('treeitem', { name: 'Verification' }).click()
  await expect(page.getByRole('alert')).toContainText('Warmed child listing failed')
  await page.getByRole('treeitem', { name: 'Hidden' }).click()
  await expect(page.getByRole('treeitem', { name: 'Deep Note' })).toBeVisible()
  expect(await pendingDirectoryCount(page, 'mock-hidden-folder')).toBe(2)
})
