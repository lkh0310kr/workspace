import Database from 'better-sqlite3'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as Y from 'yjs'
import type {
  DriveOutbox,
  DriveOutboxOperation,
  GoogleDriveYjsDocumentHandle,
  GoogleDriveYjsDocumentStorage
} from '@pkms/google-drive'
import { appSupportDir } from '../persistence'

type SqliteDatabase = InstanceType<typeof Database>
type BytesJson = { $pkmsBytes: string }

function encodeValue(value: unknown): unknown {
  if (value instanceof Uint8Array) return { $pkmsBytes: Buffer.from(value).toString('base64') }
  if (Array.isArray(value)) return value.map(encodeValue)
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)]))
  return value
}

function decodeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeValue)
  if (value && typeof value === 'object') {
    if ('$pkmsBytes' in value && typeof (value as BytesJson).$pkmsBytes === 'string')
      return new Uint8Array(Buffer.from((value as BytesJson).$pkmsBytes, 'base64'))
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeValue(item)]))
  }
  return value
}

/** Durable native Drive state shared by the Desktop outbox and Yjs replica. */
export class GoogleDriveDesktopStorage implements DriveOutbox, GoogleDriveYjsDocumentStorage {
  private readonly database: SqliteDatabase

  constructor(databasePath = path.join(appSupportDir(), 'pkms-google-drive.sqlite')) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 })
    this.database = new Database(databasePath)
    this.database.pragma('journal_mode = WAL')
    this.database.pragma('synchronous = FULL')
    this.database.pragma('foreign_keys = ON')
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS operations (
        workspace_root_id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        operation_json TEXT NOT NULL,
        PRIMARY KEY (workspace_root_id, operation_id)
      );
      CREATE INDEX IF NOT EXISTS operations_order
        ON operations (workspace_root_id, sequence, operation_id);
      CREATE TABLE IF NOT EXISTS applied_operations (
        workspace_root_id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        PRIMARY KEY (workspace_root_id, operation_id)
      );
      CREATE TABLE IF NOT EXISTS yjs_documents (
        document_key TEXT PRIMARY KEY,
        state BLOB NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `)
  }

  closeDatabase(): void {
    this.database.close()
  }

  async getDeviceId(): Promise<string> {
    const existing = this.database
      .prepare('SELECT value FROM metadata WHERE key = ?')
      .get('deviceId') as { value: string } | undefined
    if (existing) return existing.value
    const id = crypto.randomUUID()
    this.database
      .prepare('INSERT OR IGNORE INTO metadata (key, value) VALUES (?, ?)')
      .run('deviceId', id)
    return (
      this.database.prepare('SELECT value FROM metadata WHERE key = ?').get('deviceId') as {
        value: string
      }
    ).value
  }

  async allocateSequence(workspaceRootId: string): Promise<number> {
    const key = `clock:${workspaceRootId}`
    const allocate = this.database.transaction(() => {
      const current = this.readNumber(key)
      const next = current + 1
      this.writeMetadata(key, String(next))
      return next
    })
    return allocate()
  }

  async observeSequence(workspaceRootId: string, sequence: number): Promise<void> {
    const key = `clock:${workspaceRootId}`
    this.database.transaction(() => {
      if (sequence > this.readNumber(key)) this.writeMetadata(key, String(sequence))
    })()
  }

  async getAppliedOperationIds(
    workspaceRootId: string,
    candidates: readonly string[]
  ): Promise<Set<string>> {
    if (!candidates.length) return new Set()
    const query = this.database.prepare(
      'SELECT operation_id FROM applied_operations WHERE workspace_root_id = ? AND operation_id = ?'
    )
    return new Set(candidates.filter((id) => query.get(workspaceRootId, id)))
  }

  async getRemoteCursor(workspaceRootId: string): Promise<string | null> {
    const row = this.database
      .prepare('SELECT value FROM metadata WHERE key = ?')
      .get(`remoteCursor:${workspaceRootId}`) as { value: string } | undefined
    return row?.value ?? null
  }

  async saveRemoteCursor(workspaceRootId: string, cursor: string): Promise<void> {
    this.writeMetadata(`remoteCursor:${workspaceRootId}`, cursor)
  }

  async markAppliedOperation(workspaceRootId: string, operationId: string): Promise<void> {
    this.database
      .prepare(
        'INSERT OR IGNORE INTO applied_operations (workspace_root_id, operation_id) VALUES (?, ?)'
      )
      .run(workspaceRootId, operationId)
  }

  async enqueue(operation: DriveOutboxOperation): Promise<void> {
    if (!operation.workspaceRootId || !operation.operationId || !operation.deviceId)
      throw new Error('Drive outbox operations require workspace, operation, and device IDs.')
    const json = JSON.stringify(encodeValue(operation))
    const existing = this.database
      .prepare(
        'SELECT operation_json FROM operations WHERE workspace_root_id = ? AND operation_id = ?'
      )
      .get(operation.workspaceRootId, operation.operationId) as
      { operation_json: string } | undefined
    if (existing) {
      if (existing.operation_json !== json) throw new Error('Drive outbox operation ID collision.')
      return
    }
    this.database
      .prepare(
        'INSERT INTO operations (workspace_root_id, operation_id, sequence, operation_json) VALUES (?, ?, ?, ?)'
      )
      .run(operation.workspaceRootId, operation.operationId, operation.sequence, json)
  }

  async list(workspaceRootId: string): Promise<DriveOutboxOperation[]> {
    const rows = this.database
      .prepare(
        'SELECT operation_json FROM operations WHERE workspace_root_id = ? ORDER BY sequence, operation_id'
      )
      .all(workspaceRootId) as Array<{ operation_json: string }>
    return rows.map((row) => decodeValue(JSON.parse(row.operation_json)) as DriveOutboxOperation)
  }

  async acknowledge(workspaceRootId: string, operationId: string): Promise<void> {
    this.database.transaction(() => {
      this.database
        .prepare('DELETE FROM operations WHERE workspace_root_id = ? AND operation_id = ?')
        .run(workspaceRootId, operationId)
      this.database
        .prepare('DELETE FROM applied_operations WHERE workspace_root_id = ? AND operation_id = ?')
        .run(workspaceRootId, operationId)
    })()
  }

  async count(workspaceRootId: string): Promise<number> {
    const row = this.database
      .prepare('SELECT COUNT(*) AS count FROM operations WHERE workspace_root_id = ?')
      .get(workspaceRootId) as { count: number }
    return row.count
  }

  async open(documentKey: string): Promise<GoogleDriveYjsDocumentHandle> {
    const doc = new Y.Doc()
    const row = this.database
      .prepare('SELECT state FROM yjs_documents WHERE document_key = ?')
      .get(documentKey) as { state: Buffer } | undefined
    if (row) Y.applyUpdate(doc, new Uint8Array(row.state))
    const persist = this.database.prepare(
      `INSERT INTO yjs_documents (document_key, state, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(document_key) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`
    )
    const save = () => persist.run(documentKey, Buffer.from(Y.encodeStateAsUpdate(doc)), Date.now())
    const onUpdate = () => save()
    doc.on('update', onUpdate)
    if (!row) save()
    return {
      doc,
      flush: async () => {
        save()
      },
      close: async () => {
        doc.off('update', onUpdate)
        save()
      }
    }
  }

  private readNumber(key: string): number {
    const row = this.database.prepare('SELECT value FROM metadata WHERE key = ?').get(key) as
      { value: string } | undefined
    return row ? Number(row.value) || 0 : 0
  }

  private writeMetadata(key: string, value: string): void {
    this.database
      .prepare(
        'INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .run(key, value)
  }
}
