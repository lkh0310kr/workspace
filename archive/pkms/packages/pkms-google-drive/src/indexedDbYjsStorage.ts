import { IndexeddbPersistence } from 'y-indexeddb'
import * as Y from 'yjs'
import type { GoogleDriveYjsDocumentHandle, GoogleDriveYjsDocumentStorage } from './yjsDocuments'

/** Durable browser/Electron renderer document cache backed by IndexedDB. */
export class IndexedDbGoogleDriveYjsDocumentStorage implements GoogleDriveYjsDocumentStorage {
  constructor(private readonly databasePrefix = 'pkms-google-drive-yjs') {}

  async open(documentKey: string): Promise<GoogleDriveYjsDocumentHandle> {
    const doc = new Y.Doc({ guid: documentKey })
    const databaseName = `${this.databasePrefix}:${encodeURIComponent(documentKey)}`
    const persistence = new IndexeddbPersistence(databaseName, doc)
    try {
      await persistence._db
      await persistence.whenSynced
    } catch (cause) {
      await persistence.destroy().catch(() => {})
      doc.destroy()
      throw cause
    }

    return {
      doc,
      async flush() {
        // This write is queued after y-indexeddb's update transaction on the same DB.
        await persistence.set('pkms-google-drive-flush-barrier', Date.now())
      },
      async close() {
        await persistence.destroy()
      }
    }
  }
}
