import 'server-only'
import crypto from 'crypto'

/**
 * Constant-time string comparison that fails closed when either secret is empty.
 */
export function safeSecretEquals(
    provided: string | null | undefined,
    expected: string | null | undefined
): boolean {
    if (!provided || !expected) return false
    const a = Buffer.from(provided, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
}

/**
 * Verifies an Authorization: Bearer <secret> header using constant-time comparison.
 * Fails closed if the expected secret env var is unset or empty.
 */
export function verifyBearerSecret(
    request: Request,
    expectedSecret: string | null | undefined
): boolean {
    if (!expectedSecret) return false
    const authHeader = request.headers.get('authorization')
    return safeSecretEquals(authHeader, `Bearer ${expectedSecret}`)
}
