export type DriveOutboxMutation =
  | { type: 'create-folder'; path: string }
  | { type: 'create-file'; path: string; mimeType: string; bytes: Uint8Array }
  | { type: 'document-update'; fileId: string; update: Uint8Array }
  | { type: 'replace-content'; fileId: string; mimeType: string; bytes: Uint8Array }
  | { type: 'rename'; fileId: string; name: string }
  | { type: 'move'; fileId: string; targetDirectoryPath: string }
  | { type: 'trash'; fileId: string }

export interface DriveOutboxOperation {
  workspaceRootId: string
  operationId: string
  deviceId: string
  sequence: number
  createdAt: number
  mutation: DriveOutboxMutation
}

export interface DriveOutbox {
  getDeviceId(): Promise<string>
  allocateSequence(workspaceRootId: string): Promise<number>
  observeSequence(workspaceRootId: string, sequence: number): Promise<void>
  getAppliedOperationIds(
    workspaceRootId: string,
    candidates: readonly string[]
  ): Promise<Set<string>>
  listAppliedOperationIds(workspaceRootId: string): Promise<Set<string>>
  markAppliedOperation(workspaceRootId: string, operationId: string): Promise<void>
  enqueue(operation: DriveOutboxOperation): Promise<void>
  list(workspaceRootId: string): Promise<DriveOutboxOperation[]>
  acknowledge(workspaceRootId: string, operationId: string): Promise<void>
  count(workspaceRootId: string): Promise<number>
}

function keyFor(workspaceRootId: string, operationId: string): string {
  return `${workspaceRootId}:${operationId}`
}

export async function enqueueDriveMutation(
  outbox: DriveOutbox,
  workspaceRootId: string,
  mutation: DriveOutboxMutation,
  now = Date.now()
): Promise<DriveOutboxOperation> {
  const operation: DriveOutboxOperation = {
    workspaceRootId,
    operationId: crypto.randomUUID(),
    deviceId: await outbox.getDeviceId(),
    sequence: await outbox.allocateSequence(workspaceRootId),
    createdAt: now,
    mutation
  }
  await outbox.enqueue(operation)
  return operation
}

function stableValue(value: unknown): string {
  if (value instanceof Uint8Array) return `bytes:${Array.from(value).join(',')}`
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableValue(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

/** IndexedDB implementation for browser and Electron renderer replicas. */
export class IndexedDbDriveOutbox implements DriveOutbox {
  private database?: Promise<IDBDatabase>

  constructor(private readonly databaseName = 'pkms-google-drive-outbox') {}

  async getDeviceId(): Promise<string> {
    const database = await this.open()
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('metadata', 'readwrite')
      const store = transaction.objectStore('metadata')
      const request = store.get('deviceId')
      let deviceId: string | undefined
      request.onsuccess = () => {
        deviceId = (request.result as { value?: string } | undefined)?.value
        if (!deviceId) {
          deviceId = crypto.randomUUID()
          store.put({ key: 'deviceId', value: deviceId })
        }
      }
      transaction.oncomplete = () => resolve(deviceId!)
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Could not persist the Drive device ID.'))
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Could not persist the Drive device ID.'))
    })
  }

  async allocateSequence(workspaceRootId: string): Promise<number> {
    const database = await this.open()
    const key = `clock:${workspaceRootId}`
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('metadata', 'readwrite')
      const store = transaction.objectStore('metadata')
      const request = store.get(key)
      let nextSequence = 1
      request.onsuccess = () => {
        nextSequence = ((request.result as { value?: number } | undefined)?.value ?? 0) + 1
        store.put({ key, value: nextSequence })
      }
      transaction.oncomplete = () => resolve(nextSequence)
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Could not allocate a Drive operation sequence.'))
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Could not allocate a Drive operation sequence.'))
    })
  }

  async observeSequence(workspaceRootId: string, sequence: number): Promise<void> {
    const database = await this.open()
    const key = `clock:${workspaceRootId}`
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('metadata', 'readwrite')
      const store = transaction.objectStore('metadata')
      const request = store.get(key)
      request.onsuccess = () => {
        const current = (request.result as { value?: number } | undefined)?.value ?? 0
        if (sequence > current) store.put({ key, value: sequence })
      }
      transaction.oncomplete = () => resolve()
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Could not update the Drive operation sequence.'))
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Could not update the Drive operation sequence.'))
    })
  }

  async getAppliedOperationIds(
    workspaceRootId: string,
    candidates: readonly string[]
  ): Promise<Set<string>> {
    if (!candidates.length) return new Set()
    const database = await this.open()
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('applied', 'readonly')
      const store = transaction.objectStore('applied')
      const applied = new Set<string>()
      let remaining = candidates.length
      for (const operationId of candidates) {
        const request = store.get(keyFor(workspaceRootId, operationId))
        request.onsuccess = () => {
          if (request.result) applied.add(operationId)
          if (--remaining === 0) resolve(applied)
        }
        request.onerror = () =>
          reject(request.error ?? new Error('Could not read Drive operation checkpoints.'))
      }
    })
  }

  async listAppliedOperationIds(workspaceRootId: string): Promise<Set<string>> {
    const database = await this.open()
    return new Promise((resolve, reject) => {
      const request = database
        .transaction('applied', 'readonly')
        .objectStore('applied')
        .index('workspaceRootId')
        .getAll(workspaceRootId)
      request.onsuccess = () =>
        resolve(
          new Set(
            (request.result as Array<{ operationId: string }>).map((item) => item.operationId)
          )
        )
      request.onerror = () =>
        reject(request.error ?? new Error('Could not read Drive operation checkpoints.'))
    })
  }

  async markAppliedOperation(workspaceRootId: string, operationId: string): Promise<void> {
    const database = await this.open()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('applied', 'readwrite')
      transaction.objectStore('applied').put({
        key: keyFor(workspaceRootId, operationId),
        workspaceRootId,
        operationId
      })
      transaction.oncomplete = () => resolve()
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Could not save Drive operation checkpoint.'))
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Could not save Drive operation checkpoint.'))
    })
  }

  async enqueue(operation: DriveOutboxOperation): Promise<void> {
    if (!operation.workspaceRootId || !operation.operationId || !operation.deviceId)
      throw new Error('Drive outbox operations require workspace, operation, and device IDs.')
    const database = await this.open()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('operations', 'readwrite')
      const store = transaction.objectStore('operations')
      const key = keyFor(operation.workspaceRootId, operation.operationId)
      const get = store.get(key)
      get.onerror = () => transaction.abort()
      get.onsuccess = () => {
        const current = get.result as DriveOutboxOperation | undefined
        if (current) {
          if (stableValue(current) !== stableValue(operation)) {
            transaction.abort()
            return
          }
          return
        }
        store.add({ ...operation, key })
      }
      transaction.oncomplete = () => resolve()
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Could not persist Drive outbox operation.'))
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Could not persist Drive outbox operation.'))
    })
  }

  async list(workspaceRootId: string): Promise<DriveOutboxOperation[]> {
    const database = await this.open()
    const records = await this.readAll(database)
    return records
      .filter((operation) => operation.workspaceRootId === workspaceRootId)
      .sort((left, right) => left.sequence - right.sequence || left.createdAt - right.createdAt)
      .map(({ key: _key, ...operation }) => operation)
  }

  async acknowledge(workspaceRootId: string, operationId: string): Promise<void> {
    const database = await this.open()
    await this.deleteKey(database, keyFor(workspaceRootId, operationId))
  }

  async count(workspaceRootId: string): Promise<number> {
    return (await this.list(workspaceRootId)).length
  }

  private open(): Promise<IDBDatabase> {
    if (this.database) return this.database
    this.database = new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest
      try {
        request = indexedDB.open(this.databaseName, 3)
      } catch (cause) {
        reject(cause)
        return
      }
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains('operations'))
          database.createObjectStore('operations', { keyPath: 'key' })
        if (!database.objectStoreNames.contains('metadata'))
          database.createObjectStore('metadata', { keyPath: 'key' })
        const applied = database.objectStoreNames.contains('applied')
          ? request.transaction!.objectStore('applied')
          : database.createObjectStore('applied', { keyPath: 'key' })
        if (!applied.indexNames.contains('workspaceRootId'))
          applied.createIndex('workspaceRootId', 'workspaceRootId')
      }
      request.onerror = () =>
        reject(request.error ?? new Error('Could not open Drive outbox storage.'))
      request.onblocked = () =>
        reject(new Error('Drive outbox storage is blocked by another open connection.'))
      request.onsuccess = () => {
        const database = request.result
        database.onversionchange = () => {
          database.close()
          this.database = undefined
        }
        resolve(database)
      }
    }).catch((cause) => {
      this.database = undefined
      throw cause
    })
    return this.database!
  }

  private readAll(database: IDBDatabase): Promise<Array<DriveOutboxOperation & { key: string }>> {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('operations', 'readonly')
      const request = transaction.objectStore('operations').getAll()
      request.onsuccess = () =>
        resolve(request.result as Array<DriveOutboxOperation & { key: string }>)
      request.onerror = () => reject(request.error ?? new Error('Could not read Drive outbox.'))
    })
  }

  private deleteKey(database: IDBDatabase, key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('operations', 'readwrite')
      transaction.objectStore('operations').delete(key)
      transaction.oncomplete = () => resolve()
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Could not acknowledge Drive outbox operation.'))
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Could not acknowledge Drive outbox operation.'))
    })
  }
}

/** Small deterministic adapter for platform tests and native storage bridges. */
export class MemoryDriveOutbox implements DriveOutbox {
  private readonly operations = new Map<string, DriveOutboxOperation>()
  private readonly clocks = new Map<string, number>()
  private readonly applied = new Set<string>()
  private readonly deviceId = crypto.randomUUID()

  async getDeviceId(): Promise<string> {
    return this.deviceId
  }

  async allocateSequence(workspaceRootId: string): Promise<number> {
    const sequence = (this.clocks.get(workspaceRootId) ?? 0) + 1
    this.clocks.set(workspaceRootId, sequence)
    return sequence
  }

  async observeSequence(workspaceRootId: string, sequence: number): Promise<void> {
    this.clocks.set(workspaceRootId, Math.max(this.clocks.get(workspaceRootId) ?? 0, sequence))
  }

  async getAppliedOperationIds(
    workspaceRootId: string,
    candidates: readonly string[]
  ): Promise<Set<string>> {
    return new Set(
      candidates.filter((operationId) => this.applied.has(keyFor(workspaceRootId, operationId)))
    )
  }

  async listAppliedOperationIds(workspaceRootId: string): Promise<Set<string>> {
    const prefix = `${workspaceRootId}:`
    return new Set(
      [...this.applied]
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.slice(prefix.length))
    )
  }

  async markAppliedOperation(workspaceRootId: string, operationId: string): Promise<void> {
    this.applied.add(keyFor(workspaceRootId, operationId))
  }

  async enqueue(operation: DriveOutboxOperation): Promise<void> {
    const key = keyFor(operation.workspaceRootId, operation.operationId)
    const current = this.operations.get(key)
    if (current && stableValue(current) !== stableValue(operation))
      throw new Error('Drive outbox operation ID collision.')
    if (!current) this.operations.set(key, structuredClone(operation))
  }

  async list(workspaceRootId: string): Promise<DriveOutboxOperation[]> {
    return [...this.operations.values()]
      .filter((operation) => operation.workspaceRootId === workspaceRootId)
      .sort((left, right) => left.sequence - right.sequence || left.createdAt - right.createdAt)
      .map((operation) => structuredClone(operation))
  }

  async acknowledge(workspaceRootId: string, operationId: string): Promise<void> {
    this.operations.delete(keyFor(workspaceRootId, operationId))
  }

  async count(workspaceRootId: string): Promise<number> {
    return (await this.list(workspaceRootId)).length
  }
}
