import crypto from 'crypto'

const ALLOWED_IMAGE_MIMES: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
}

function getR2Env() {
    const accountId = (process.env.R2_ACCOUNT_ID || '').trim()
    const bucketName = (process.env.R2_BUCKET_NAME || '').trim()
    const publicUrl = (process.env.R2_PUBLIC_URL || '').trim().replace(/\/+$/, '')
    const accessKeyId = (process.env.R2_ACCESS_KEY_ID || '').trim()
    const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || '').trim()

    return { accountId, bucketName, publicUrl, accessKeyId, secretAccessKey }
}

/**
 * Returns true when all 5 Cloudflare R2 credentials/URL variables are populated.
 */
export function isR2Configured(): boolean {
    const { accountId, bucketName, publicUrl, accessKeyId, secretAccessKey } = getR2Env()
    return Boolean(
        accountId &&
        bucketName &&
        publicUrl &&
        accessKeyId &&
        secretAccessKey &&
        !accessKeyId.includes('paste-') &&
        !secretAccessKey.includes('paste-')
    )
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
    return crypto.createHmac('sha256', key).update(data, 'utf8').digest()
}

function sha256Hex(data: Buffer | string): string {
    return crypto.createHash('sha256').update(data).digest('hex')
}

function encodeS3Path(pathStr: string): string {
    return pathStr
        .split('/')
        .map(seg => encodeURIComponent(seg))
        .join('/')
}

async function signAndSendR2Request({
    method,
    key,
    body,
    contentType,
    cacheControl
}: {
    method: 'PUT' | 'DELETE' | 'HEAD'
    key: string
    body?: Buffer
    contentType?: string
    cacheControl?: string
}) {
    if (!isR2Configured()) {
        throw new Error('Cloudflare R2 environment variables are not configured')
    }

    const { accountId, bucketName, publicUrl, accessKeyId, secretAccessKey } = getR2Env()
    const cleanKey = key.replace(/^\/+/, '')
    const host = `${accountId}.r2.cloudflarestorage.com`
    const canonicalUri = `/${encodeS3Path(`${bucketName}/${cleanKey}`)}`
    const endpointUrl = `https://${host}${canonicalUri}`

    const now = new Date()
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
    const dateStamp = amzDate.slice(0, 8)
    const region = 'auto'
    const service = 's3'

    const payloadBytes = body ?? Buffer.alloc(0)
    const payloadHash = sha256Hex(payloadBytes)

    const headersToSign: Record<string, string> = {
        host,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate
    }

    if (cacheControl) headersToSign['cache-control'] = cacheControl
    if (contentType) headersToSign['content-type'] = contentType

    const sortedKeys = Object.keys(headersToSign).sort()
    const canonicalHeaders = sortedKeys.map(k => `${k}:${headersToSign[k].trim()}\n`).join('')
    const signedHeaders = sortedKeys.join(';')

    const canonicalRequest = [
        method,
        canonicalUri,
        '', // empty query string
        canonicalHeaders,
        signedHeaders,
        payloadHash
    ].join('\n')

    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        sha256Hex(canonicalRequest)
    ].join('\n')

    const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp)
    const kRegion = hmacSha256(kDate, region)
    const kService = hmacSha256(kRegion, service)
    const kSigning = hmacSha256(kService, 'aws4_request')
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex')

    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

    const requestHeaders: Record<string, string> = {
        ...headersToSign,
        Authorization: authorization
    }
    delete requestHeaders.host // fetch sets Host automatically

    const res = await fetch(endpointUrl, {
        method,
        headers: requestHeaders,
        body: method === 'PUT' ? new Uint8Array(payloadBytes) : undefined
    })

    if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        throw new Error(`R2 ${method} ${cleanKey} failed (${res.status}): ${errBody.slice(0, 300)}`)
    }

    return {
        key: cleanKey,
        publicUrl: `${publicUrl}/${cleanKey}`,
        status: res.status
    }
}

/**
 * Uploads binary object directly to Cloudflare R2 and returns its key + public URL.
 */
export async function putR2Object({
    key,
    body,
    contentType,
    cacheControl = 'public, max-age=31536000, immutable'
}: {
    key: string
    body: Buffer
    contentType: string
    cacheControl?: string
}) {
    return signAndSendR2Request({
        method: 'PUT',
        key,
        body,
        contentType,
        cacheControl
    })
}

/**
 * Deletes an object from Cloudflare R2 by key.
 */
export async function deleteR2Object(key: string) {
    return signAndSendR2Request({
        method: 'DELETE',
        key
    })
}

/**
 * Parses a validated base64 image data URL into binary Buffer and MIME metadata.
 */
export function parseImageDataUrl(dataUrl: string): {
    buffer: Buffer
    mimeType: string
    ext: string
} {
    const match = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl.trim())
    if (!match) {
        throw new Error('Invalid image data URL format')
    }
    const mimeType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase()
    const ext = ALLOWED_IMAGE_MIMES[mimeType] || 'jpg'
    const buffer = Buffer.from(match[2], 'base64')
    if (buffer.length === 0) {
        throw new Error('Decoded image buffer is empty')
    }
    return { buffer, mimeType, ext }
}

/**
 * Uploads a base64 image data URL to Cloudflare R2 under avatars/{keyPrefix}-{ts}-{hash}.{ext}.
 */
export async function uploadDataUrlToR2(dataUrl: string, keyPrefix: string) {
    const { buffer, mimeType, ext } = parseImageDataUrl(dataUrl)
    const shortHash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 10)
    const cleanPrefix = keyPrefix.replace(/[^a-zA-Z0-9_-]/g, '')
    const key = `avatars/${cleanPrefix}-${Date.now()}-${shortHash}.${ext}`

    return putR2Object({
        key,
        body: buffer,
        contentType: mimeType
    })
}
