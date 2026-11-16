import {
  appendFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { createGzip, constants as zlibConstants } from 'node:zlib'
import { pipeline } from 'node:stream/promises'

const MAX_ACTIVE_LOG_BYTES = 16 * 1024 * 1024
const activeFileSizes = new Map<string, number>()
const recoveredDirectories = new Set<string>()
let archiveSequence = 0
let compressionQueue = Promise.resolve()

/** Append one lossless NDJSON record and rotate full files into gzip archives. */
export function appendRotatingLogLine(filePath: string, line: string): void {
  const directory = dirname(filePath)
  mkdirSync(directory, { recursive: true })
  recoverUncompressedArchives(directory)

  const bytes = Buffer.from(line, 'utf8')
  let currentSize = getActiveFileSize(filePath)
  if (currentSize > 0 && currentSize + bytes.length > MAX_ACTIVE_LOG_BYTES) {
    if (rotateLogFile(filePath, currentSize)) currentSize = 0
  }

  appendFileSync(filePath, bytes)
  currentSize += bytes.length
  activeFileSizes.set(filePath, currentSize)

  if (currentSize >= MAX_ACTIVE_LOG_BYTES) rotateLogFile(filePath, currentSize)
}

function getActiveFileSize(filePath: string): number {
  const cached = activeFileSizes.get(filePath)
  if (cached !== undefined) return cached
  const size = existsSync(filePath) ? statSync(filePath).size : 0
  activeFileSizes.set(filePath, size)
  return size
}

function rotateLogFile(filePath: string, size: number): boolean {
  if (size === 0 || !existsSync(filePath)) return false
  const extension = '.ndjson'
  const fileName = basename(filePath)
  const stem = fileName.endsWith(extension) ? fileName.slice(0, -extension.length) : fileName
  const timestamp = new Date().toISOString().replace(/[-:.]/g, '')
  const archivePath = join(
    dirname(filePath),
    `${stem}.archive.${timestamp}.${process.pid}.${++archiveSequence}${extension}`
  )
  try {
    renameSync(filePath, archivePath)
  } catch {
    // Keep the active file intact if the filesystem refuses rotation.
    return false
  }
  activeFileSizes.set(filePath, 0)
  enqueueCompression(archivePath)
  return true
}

function recoverUncompressedArchives(directory: string): void {
  if (recoveredDirectories.has(directory)) return
  recoveredDirectories.add(directory)
  try {
    for (const name of readdirSync(directory)) {
      if (name.includes('.archive.') && name.endsWith('.ndjson')) {
        enqueueCompression(join(directory, name))
      }
    }
  } catch {
    // Logging must remain available even when archive recovery is unavailable.
  }
}

function enqueueCompression(sourcePath: string): void {
  compressionQueue = compressionQueue
    .then(async () => {
      const destinationPath = `${sourcePath}.gz`
      const temporaryPath = `${destinationPath}.tmp`
      try {
        rmSync(temporaryPath, { force: true })
        await pipeline(
          createReadStream(sourcePath),
          createGzip({ level: zlibConstants.Z_DEFAULT_COMPRESSION }),
          createWriteStream(temporaryPath, { flags: 'wx' })
        )
        renameSync(temporaryPath, destinationPath)
        rmSync(sourcePath)
      } catch {
        // Retain the uncompressed source on any compression or filesystem error.
        rmSync(temporaryPath, { force: true })
      }
    })
    .catch(() => {
      // A failed archive must never interrupt writing the active diagnostic log.
    })
}
