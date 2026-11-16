import assert from 'node:assert/strict'
import { test } from 'node:test'
import { flushDocumentBeforeWorkspaceSync } from './flushDocumentBeforeWorkspaceSync.ts'

test('finishes saving the current workspace before syncing the next one', async () => {
  const order: string[] = []
  let resolveSave!: (value: { syncPhase: 'synced' }) => void
  let resolveNextSync!: () => void
  const save = () =>
    new Promise<{ syncPhase: 'synced' }>((resolve) => {
      resolveSave = resolve
    })
  const session = {
    save: async () => {
      order.push('current-save-start')
      const result = await save()
      order.push('current-save-done')
      return result
    },
    close: async () => {
      order.push('current-close')
    }
  }
  const syncNext = async () => {
    order.push('next-sync-start')
    await new Promise<void>((resolve) => {
      resolveNextSync = resolve
    })
    order.push('next-sync-done')
  }
  const switching = flushDocumentBeforeWorkspaceSync(session, syncNext)

  assert.deepEqual(order, ['current-save-start'])
  resolveSave({ syncPhase: 'synced' })
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.deepEqual(order, ['current-save-start', 'current-save-done', 'next-sync-start'])
  resolveNextSync()
  await switching

  assert.deepEqual(order, [
    'current-save-start',
    'current-save-done',
    'next-sync-start',
    'next-sync-done',
    'current-close'
  ])
})

test('keeps the current workspace when its document is not synced', async () => {
  let nextWorkspaceSynced = false
  const syncNext = async () => {
    nextWorkspaceSynced = true
  }
  const session = {
    save: async () => ({ syncPhase: 'blocked', message: 'offline' }),
    close: async () => {
      throw new Error('must not close before the current document is synced')
    }
  }

  await assert.rejects(flushDocumentBeforeWorkspaceSync(session, syncNext), /offline/)
  assert.equal(nextWorkspaceSynced, false)
})

test('keeps the current session open when the next workspace sync fails', async () => {
  const order: string[] = []
  const session = {
    save: async () => ({ syncPhase: 'synced' }),
    close: async () => {
      order.push('current-close')
    }
  }
  const syncNext = async () => {
    order.push('next-sync')
    throw new Error('next workspace offline')
  }

  await assert.rejects(
    flushDocumentBeforeWorkspaceSync(session, syncNext),
    /next workspace offline/
  )
  assert.deepEqual(order, ['next-sync'])
})

test('syncs the next workspace when there is no open document', async () => {
  let nextWorkspaceSynced = false
  const syncNext = async () => {
    nextWorkspaceSynced = true
  }

  await flushDocumentBeforeWorkspaceSync(null, syncNext)
  assert.equal(nextWorkspaceSynced, true)
})
