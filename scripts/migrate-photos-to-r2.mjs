/**
 * Safe, Verified Cloudflare R2 Photo Migration Script
 *
 * Modes:
 *   node scripts/migrate-photos-to-r2.mjs --dry-run          (Default: 0 writes, counts & MB only)
 *   node scripts/migrate-photos-to-r2.mjs --limit=1          (Test 1 row: backup -> R2 -> HTTP 200 check -> single-row UPDATE)
 *   node scripts/migrate-photos-to-r2.mjs --all              (Migrate all remaining data:image/* rows safely)
 *   node scripts/migrate-photos-to-r2.mjs --rollback=<file>  (Restore original Base64 from backup NDJSON)
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
require('dotenv').config({ path: '.env.local' })
require('dotenv').config({ path: '.env' })

const { Client } = require('pg')
const sharp = require('sharp')

// --- CLI Args ---
const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run') || (!args.some(a => a === '--all' || a.startsWith('--limit=') || a.startsWith('--rollback=')))
const runAll = args.includes('--all')
const limitArg = args.find(a => a.startsWith('--limit='))
const limitCount = limitArg ? Math.max(1, parseInt(limitArg.split('=')[1], 10) || 1) : null
const rollbackArg = args.find(a => a.startsWith('--rollback='))
const rollbackFile = rollbackArg ? rollbackArg.split('=')[1] : null

// --- R2 Config ---
const accountId = (process.env.R2_ACCOUNT_ID || '').trim()
const bucketName = (process.env.R2_BUCKET_NAME || '').trim()
const publicUrlBase = (process.env.R2_PUBLIC_URL || '').trim().replace(/\/+$/, '')
const accessKeyId = (process.env.R2_ACCESS_KEY_ID || '').trim()
const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || '').trim()

function assertR2Env() {
    if (!accountId || !bucketName || !publicUrlBase || !accessKeyId || !secretAccessKey) {
        throw new Error('Missing one or more R2_* variables in .env.local / .env')
    }
}

function hmacSha256(key, data) {
    return crypto.createHmac('sha256', key).update(data, 'utf8').digest()
}

function sha256Hex(data) {
    return crypto.createHash('sha256').update(data).digest('hex')
}

async function putToR2(key, body, contentType) {
    assertR2Env()
    const cleanKey = key.replace(/^\/+/, '')
    const host = `${accountId}.r2.cloudflarestorage.com`
    const canonicalUri = '/' + `${bucketName}/${cleanKey}`.split('/').map(s => encodeURIComponent(s)).join('/')
    const endpointUrl = `https://${host}${canonicalUri}`

    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
    const dateStamp = amzDate.slice(0, 8)
    const region = 'auto'
    const service = 's3'
    const payloadHash = sha256Hex(body)
    const cacheControl = 'public, max-age=31536000, immutable'

    const headersToSign = {
        'cache-control': cacheControl,
        'content-type': contentType,
        host,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate
    }

    const sortedKeys = Object.keys(headersToSign).sort()
    const canonicalHeaders = sortedKeys.map(k => `${k}:${headersToSign[k]}\n`).join('')
    const signedHeaders = sortedKeys.join(';')

    const canonicalRequest = ['PUT', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n')

    const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp)
    const kRegion = hmacSha256(kDate, region)
    const kService = hmacSha256(kRegion, service)
    const kSigning = hmacSha256(kService, 'aws4_request')
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex')

    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
    const reqHeaders = { ...headersToSign, Authorization: authorization }
    delete reqHeaders.host

    const res = await fetch(endpointUrl, {
        method: 'PUT',
        headers: reqHeaders,
        body: new Uint8Array(body)
    })

    if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`R2 PUT failed (${res.status}): ${txt.slice(0, 200)}`)
    }

    return `${publicUrlBase}/${cleanKey}`
}

async function verifyPublicUrl(url, expectedBytes) {
    const res = await fetch(url, { method: 'GET' })
    if (!res.ok) {
        throw new Error(`Public R2 verification failed (${res.status}) for ${url}`)
    }
    const arrBuf = await res.arrayBuffer()
    if (arrBuf.byteLength !== expectedBytes) {
        throw new Error(`Verified byte mismatch: expected ${expectedBytes}, got ${arrBuf.byteLength}`)
    }
}

function parseDataUrl(dataUrl) {
    const match = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(dataUrl.trim())
    if (!match) {
        throw new Error('Unsupported or malformed image data URL')
    }
    const rawMime = match[1].toLowerCase()
    const mimeType = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime
    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : mimeType === 'image/gif' ? 'gif' : 'jpg'
    const base64Clean = match[2].replace(/\s+/g, '')
    const buffer = Buffer.from(base64Clean, 'base64')
    if (buffer.length === 0) throw new Error('Empty base64 buffer')
    return { buffer, mimeType, ext }
}

async function prepareUploadPayload(dataUrl) {
    const { buffer, mimeType, ext } = parseDataUrl(dataUrl)
    // Validate original buffer via sharp
    const meta = await sharp(buffer, { failOn: 'error' }).metadata()
    if (!meta.width || !meta.height) {
        throw new Error('Invalid image dimensions')
    }

    // Re-encode large images (> 200 KB) to crisp 800x800 JPEG; preserve smaller GIF/PNG/JPEG as-is
    if (buffer.length > 200 * 1024 && mimeType !== 'image/gif') {
        const optimized = await sharp(buffer)
            .rotate() // Respect EXIF orientation
            .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85, mozjpeg: true })
            .toBuffer()

        await sharp(optimized, { failOn: 'error' }).metadata()
        return { uploadBuffer: optimized, uploadMime: 'image/jpeg', uploadExt: 'jpg' }
    }

    return { uploadBuffer: buffer, uploadMime: mimeType, uploadExt: ext }
}

async function runRollback(client, filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Backup file not found: ${filePath}`)
    }
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean)
    console.log(`Restoring ${lines.length} record(s) from ${filePath}...`)
    let restored = 0
    for (const line of lines) {
        const rec = JSON.parse(line)
        await client.query(
            `UPDATE "${rec.table}" SET "profileImage" = $1 WHERE "${rec.idColumn}" = $2`,
            [rec.oldProfileImage, rec.id]
        )
        restored++
    }
    console.log(`Rollback complete: restored ${restored} row(s).`)
}

async function main() {
    const conn = process.env.DIRECT_URL || process.env.DATABASE_URL
    if (!conn) throw new Error('DIRECT_URL / DATABASE_URL not set')

    const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })
    await client.connect()

    try {
        if (rollbackFile) {
            await runRollback(client, rollbackFile)
            return
        }

        // Query counts & sizes across both User and Admin
        const [userSummary, adminSummary] = await Promise.all([
            client.query(`
                SELECT
                    COUNT(*) FILTER (WHERE "profileImage" LIKE 'data:image/%') AS base64_rows,
                    COUNT(*) FILTER (WHERE "profileImage" LIKE 'https://%') AS url_rows,
                    ROUND(COALESCE(SUM(length("profileImage")) FILTER (WHERE "profileImage" LIKE 'data:image/%'), 0) / 1048576.0, 2) AS base64_mb
                FROM "User"
            `),
            client.query(`
                SELECT
                    COUNT(*) FILTER (WHERE "profileImage" LIKE 'data:image/%') AS base64_rows,
                    COUNT(*) FILTER (WHERE "profileImage" LIKE 'https://%') AS url_rows,
                    ROUND(COALESCE(SUM(length("profileImage")) FILTER (WHERE "profileImage" LIKE 'data:image/%'), 0) / 1048576.0, 2) AS base64_mb
                FROM "Admin"
            `)
        ])

        console.log('=== DRY-RUN / PRE-FLIGHT STORAGE REPORT ===')
        console.log('User :', userSummary.rows[0])
        console.log('Admin:', adminSummary.rows[0])

        if (isDryRun) {
            console.log('\n[DRY-RUN COMPLETE] Zero R2 uploads and zero DB writes performed.')
            console.log('Next safe test: node scripts/migrate-photos-to-r2.mjs --limit=1')
            return
        }

        assertR2Env()

        const targets = [
            { table: 'User', idColumn: 'userId', prefix: 'user' },
            { table: 'Admin', idColumn: 'adminId', prefix: 'admin' }
        ]

        fs.mkdirSync(path.join(process.cwd(), 'backups'), { recursive: true })
        const backupFile = path.join(
            process.cwd(),
            'backups',
            `r2-photo-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson`
        )

        let remainingAllowed = runAll ? Infinity : (limitCount || 1)
        let migratedCount = 0
        let skippedCount = 0
        let savedBytes = 0

        for (const t of targets) {
            if (remainingAllowed <= 0) break

            const idRes = await client.query(`
                SELECT "${t.idColumn}" AS id
                FROM "${t.table}"
                WHERE "profileImage" LIKE 'data:image/%'
                ORDER BY length("profileImage") DESC
                ${Number.isFinite(remainingAllowed) ? `LIMIT ${remainingAllowed}` : ''}
            `)

            console.log(`\nProcessing ${idRes.rows.length} candidate row(s) from ${t.table}...`)

            for (const rowMeta of idRes.rows) {
                if (remainingAllowed <= 0) break

                const rowRes = await client.query(
                    `SELECT "${t.idColumn}" AS id, "profileImage" FROM "${t.table}" WHERE "${t.idColumn}" = $1`,
                    [rowMeta.id]
                )
                const row = rowRes.rows[0]
                if (!row || !row.profileImage || !row.profileImage.startsWith('data:image/')) continue

                try {
                    const oldProfileImage = row.profileImage
                    const { uploadBuffer, uploadMime, uploadExt } = await prepareUploadPayload(oldProfileImage)
                    const sha8 = crypto.createHash('sha256').update(uploadBuffer).digest('hex').slice(0, 10)
                    const key = `avatars/${t.prefix}-${row.id}-${sha8}.${uploadExt}`

                    const r2Url = await putToR2(key, uploadBuffer, uploadMime)
                    await verifyPublicUrl(r2Url, uploadBuffer.length)

                    // Write local backup record BEFORE modifying Postgres
                    fs.appendFileSync(
                        backupFile,
                        JSON.stringify({
                            table: t.table,
                            idColumn: t.idColumn,
                            id: row.id,
                            oldLength: oldProfileImage.length,
                            oldProfileImage,
                            newUrl: r2Url,
                            timestamp: new Date().toISOString()
                        }) + '\n',
                        'utf8'
                    )

                    await client.query(
                        `UPDATE "${t.table}" SET "profileImage" = $1 WHERE "${t.idColumn}" = $2`,
                        [r2Url, row.id]
                    )

                    migratedCount++
                    remainingAllowed--
                    savedBytes += Math.max(0, oldProfileImage.length - r2Url.length)

                    console.log(
                        `[OK] ${t.table}#${row.id}: ${(oldProfileImage.length / 1024).toFixed(1)} KB Base64 -> ${(uploadBuffer.length / 1024).toFixed(1)} KB R2 (${r2Url})`
                    )
                } catch (err) {
                    skippedCount++
                    console.error(`[SKIP] ${t.table}#${row.id}: ${err.message} (existing Postgres Base64 untouched)`)
                }
            }
        }

        console.log('\n=== MIGRATION SUMMARY ===')
        console.log(`Migrated: ${migratedCount} | Skipped: ${skippedCount} | Reclaimed payload: ${(savedBytes / 1048576).toFixed(2)} MB`)
        console.log(`Rollback backup saved at: ${backupFile}`)
    } finally {
        await client.end()
    }
}

main().catch(err => {
    console.error('Migration error:', err)
    process.exit(1)
})
