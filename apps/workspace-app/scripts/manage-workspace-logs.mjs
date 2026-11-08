import { createHash } from 'node:crypto'
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { createGzip, createGunzip, constants as zlibConstants } from 'node:zlib'
import { Transform, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const MiB = 1024 * 1024
const MIN_COMPRESS_BYTES = MiB
const mode = process.argv[2] ?? 'compress'
const appData = process.env.APPDATA ?? join(homedir(), '.config')
const supportRoot = process.platform === 'darwin'
  ? join(homedir(), 'Library', 'Application Support')
  : process.platform === 'win32'
    ? appData
    : join(homedir(), '.config')
const logDirs = ['workspace-app', 'workspace-app-dev'].map((name) => join(supportRoot, name, 'logs'))

if (!['compress', 'restore'].includes(mode)) {
  console.error('Usage: node scripts/manage-workspace-logs.mjs [compress|restore] [--app-closed]')
  process.exit(2)
}

if (mode === 'compress' && !process.argv.includes('--app-closed')) {
  console.error('Quit all Workspace instances, then pass --app-closed to confirm the log files are idle.')
  process.exit(2)
}

if (mode === 'compress') await compressExistingLogs()
else await restoreCompressedLogs()

async function compressExistingLogs() {
  let compressed = 0
  let originalBytes = 0
  let compressedBytes = 0

  for (const directory of logDirs) {
    if (!existsSync(directory)) continue
    const candidates = readdirSync(directory)
      .filter((name) => name.endsWith('.ndjson') && !name.includes('.archive.'))
      .map((name) => join(directory, name))
      .filter((filePath) => statSync(filePath).size >= MIN_COMPRESS_BYTES)

    for (const filePath of candidates) {
      const inputBytes = statSync(filePath).size
      const gzipPath = `${filePath}.gz`
      const temporaryPath = `${gzipPath}.tmp`
      if (existsSync(gzipPath)) throw new Error(`Refusing to overwrite existing archive: ${gzipPath}`)

      rmSync(temporaryPath, { force: true })
      await pipeline(
        createReadStream(filePath),
        createGzip({ level: zlibConstants.Z_DEFAULT_COMPRESSION }),
        createWriteStream(temporaryPath, { flags: 'wx' }),
      )
      await verifyGzipRoundTrip(filePath, temporaryPath)
      renameSync(temporaryPath, gzipPath)
      unlinkSync(filePath)
      // Keep the conventional active path available for the next app launch.
      writeFileSync(filePath, '', { flag: 'wx' })

      const outputBytes = statSync(gzipPath).size
      compressed++
      originalBytes += inputBytes
      compressedBytes += outputBytes
      console.log(`${basename(filePath)}: ${formatBytes(inputBytes)} -> ${formatBytes(outputBytes)} (verified)`)
    }
  }

  console.log(`Compressed ${compressed} files: ${formatBytes(originalBytes)} -> ${formatBytes(compressedBytes)}; all source records retained losslessly.`)
}

async function restoreCompressedLogs() {
  let restored = 0
  for (const directory of logDirs) {
    if (!existsSync(directory)) continue
    const outputDirectory = join(directory, 'restored-logs')
    mkdirSync(outputDirectory, { recursive: true })
    const archives = readdirSync(directory).filter((name) => name.endsWith('.ndjson.gz'))
    for (const name of archives) {
      const archivePath = join(directory, name)
      const outputPath = join(outputDirectory, name.slice(0, -'.gz'.length))
      const temporaryPath = `${outputPath}.tmp`
      if (existsSync(outputPath)) throw new Error(`Refusing to overwrite restored log: ${outputPath}`)
      rmSync(temporaryPath, { force: true })
      await pipeline(createReadStream(archivePath), createGunzip(), createWriteStream(temporaryPath, { flags: 'wx' }))
      renameSync(temporaryPath, outputPath)
      restored++
      console.log(`Restored ${join('restored-logs', name.slice(0, -'.gz'.length))}`)
    }
  }
  console.log(`Restored ${restored} compressed log files. Archives remain unchanged.`)
}

async function verifyGzipRoundTrip(sourcePath, gzipPath) {
  const sourceHash = await hashFile(sourcePath)
  const restoredHash = createHash('sha256')
  const hashTransform = new Transform({
    transform(chunk, _encoding, callback) {
      restoredHash.update(chunk)
      callback(null, chunk)
    },
  })
  await pipeline(
    createReadStream(gzipPath),
    createGunzip(),
    hashTransform,
    new Writable({ write(_chunk, _encoding, callback) { callback() } }),
  )
  if (sourceHash !== restoredHash.digest('hex')) {
    throw new Error(`Gzip verification failed; original retained at ${sourcePath}`)
  }
}

async function hashFile(filePath) {
  const hash = createHash('sha256')
  await pipeline(
    createReadStream(filePath),
    new Transform({
      transform(chunk, _encoding, callback) {
        hash.update(chunk)
        callback(null, chunk)
      },
    }),
    new Writable({ write(_chunk, _encoding, callback) { callback() } }),
  )
  return hash.digest('hex')
}

function formatBytes(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GiB`
  if (bytes >= MiB) return `${(bytes / MiB).toFixed(2)} MiB`
  return `${(bytes / 1024).toFixed(1)} KiB`
}
