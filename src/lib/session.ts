import 'server-only'
import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

export interface SessionPayload extends JWTPayload {
    userId: number
    userType: 'user' | 'admin'
    role?: string
    status?: string
    ip?: string
    is2faVerified?: boolean
}
import { cookies, headers } from 'next/headers'

const secretKey = process.env.JWT_SECRET
if (!secretKey) {
    console.error('CRITICAL: JWT_SECRET environment variable is missing!')
}

function getEncodedKey(): Uint8Array | null {
    const key = process.env.JWT_SECRET
    if (!key) return null
    return new TextEncoder().encode(key)
}

export async function createSession(userId: number, userType: 'user' | 'admin' = 'user', role?: string, is2faVerified: boolean = true, status?: string) {
    const encodedKey = getEncodedKey()
    if (!encodedKey) {
        throw new Error('JWT_SECRET environment variable is required')
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days for mobile persistence

    // Get client IP for tracking (1.4)
    const clientIp = (await headers()).get('x-forwarded-for')?.split(',')[0] || 'unknown'

    const session = await new SignJWT({ userId, userType, role, status, is2faVerified })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('30d')
        .sign(encodedKey)

    const cookieStore = await cookies()
    cookieStore.set('session', session, {
        httpOnly: true,
        secure: true, // Required for 'none' sameSite in Play Store APKs
        expires: expiresAt,
        sameSite: 'none', // Mandatory for Capacitor / Android APK cross-site access
        path: '/',
    })
}

export async function getSession() {
    const cookieStore = await cookies()
    const session = cookieStore.get('session')?.value
    if (!session) return null

    return await verifySessionToken(session)
}

export async function verifySessionToken(token: string) {
    try {
        const encodedKey = getEncodedKey()
        if (!encodedKey) return null

        const { payload } = await jwtVerify(token, encodedKey, {
            algorithms: ['HS256'],
        })
        return payload as SessionPayload
    } catch (error) {
        return null
    }
}

export async function setOtpVerifiedCookie(mobile: string) {
    const encodedKey = getEncodedKey()
    if (!encodedKey) {
        throw new Error('JWT_SECRET environment variable is required')
    }

    const token = await new SignJWT({ mobile, purpose: 'otp_verified' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('30m')
        .sign(encodedKey)

    const cookieStore = await cookies()
    cookieStore.set('otp_verified', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/',
        maxAge: 1800,
    })
}

export async function verifyOtpVerifiedCookie(expectedMobile: string): Promise<boolean> {
    try {
        const encodedKey = getEncodedKey()
        if (!encodedKey) return false

        const cookieStore = await cookies()
        const token = cookieStore.get('otp_verified')?.value
        if (!token) return false

        const { payload } = await jwtVerify(token, encodedKey, {
            algorithms: ['HS256'],
        })
        return payload?.purpose === 'otp_verified' && payload?.mobile === expectedMobile
    } catch {
        return false
    }
}

export async function clearOtpVerifiedCookie() {
    const cookieStore = await cookies()
    cookieStore.delete('otp_verified')
}

export async function rotateSession() {
    const session = await getSession()
    if (!session) return

    // Create a new session with current data to refresh expiry and rotation (1.4)
    await createSession(
        session.userId as number,
        session.userType as 'user' | 'admin',
        session.role as string | undefined,
        session.is2faVerified as boolean | undefined,
        session.status as string | undefined
    )
}

export async function deleteSession() {
    const cookieStore = await cookies()
    cookieStore.delete('session')
}
