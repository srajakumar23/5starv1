import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

// Inline JWT verification for Edge Middleware (cannot use session.ts which requires next/headers)
async function verifySessionToken(token: string) {
    try {
        const secretKey = process.env.JWT_SECRET
        if (!secretKey) return null
        const encodedKey = new TextEncoder().encode(secretKey)
        const { payload } = await jwtVerify(token, encodedKey, {
            algorithms: ['HS256'],
        })
        return payload as any
    } catch {
        return null
    }
}

// In-memory rate limiting store (Note: In a serverless/multi-instance env, this would be Redis)
const rateLimit = new Map<string, { count: number; resetTime: number }>()

const LIMITS = {
    login: { max: 5, window: 15 * 60 * 1000 }, // 5 per 15 min
    otp: { max: 2, window: 60 * 1000 },        // 2 per 1 min (Defensive)
    api: { max: 1000, window: 60 * 1000 },      // 1000 per min (Increased for dev)
}

function checkRateLimit(key: string, type: keyof typeof LIMITS): boolean {
    const now = Date.now()
    if (rateLimit.size > 5000) {
        for (const [k, v] of rateLimit.entries()) {
            if (now > v.resetTime) rateLimit.delete(k)
        }
    }

    const limit = LIMITS[type]
    const record = rateLimit.get(key)

    if (!record || now > record.resetTime) {
        rateLimit.set(key, { count: 1, resetTime: now + limit.window })
        return true
    }

    if (record.count >= limit.max) {
        return false
    }

    record.count++
    return true
}

function getAllowedOrigins(requestOrigin: string): Set<string> {
    const allowed = new Set<string>([
        requestOrigin,
        'https://www.5starambassador.com',
        'https://5starambassador.com',
        'https://achariya.in',
        'https://www.achariya.in',
        'capacitor://localhost',
        'http://localhost',
        'https://localhost',
    ])

    if (process.env.NEXT_PUBLIC_APP_URL) {
        try {
            allowed.add(new URL(process.env.NEXT_PUBLIC_APP_URL).origin)
        } catch {
            // Ignore malformed URL
        }
    }

    if (process.env.VERCEL_URL) {
        allowed.add(`https://${process.env.VERCEL_URL}`)
    }

    if (process.env.NODE_ENV !== 'production') {
        allowed.add('http://localhost:3000')
        allowed.add('http://localhost:3001')
        allowed.add('http://127.0.0.1:3001')
    }

    return allowed
}

export async function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname

    // 1. Skip middleware for static assets
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/static') ||
        pathname.match(/\.(ico|png|jpg|jpeg|svg|css|js)$/)
    ) {
        return NextResponse.next()
    }

    // 1.5 Dynamic Allowlisted CORS & CSRF Origin Guard on cookie-authenticated APIs
    const origin = request.headers.get('origin')
    const allowedOrigins = getAllowedOrigins(request.nextUrl.origin)
    const isOriginAllowed = !origin || allowedOrigins.has(origin)

    if (pathname.startsWith('/api/')) {
        if (request.method === 'OPTIONS') {
            if (!origin || !isOriginAllowed) {
                return new NextResponse(null, { status: 403 })
            }
            return new NextResponse(null, {
                status: 204,
                headers: {
                    'Access-Control-Allow-Origin': origin,
                    'Access-Control-Allow-Credentials': 'true',
                    'Access-Control-Allow-Methods': 'GET,DELETE,PATCH,POST,PUT,OPTIONS',
                    'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
                    'Vary': 'Origin',
                },
            })
        }

        const isCookieMutationApi =
            (pathname.startsWith('/api/profile/') ||
                pathname === '/api/payment/create-order' ||
                pathname === '/api/payment/grayquest/create-session') &&
            ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)

        if (isCookieMutationApi && origin && !isOriginAllowed) {
            return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 })
        }
    }

    // 2. Rate Limiting
    const headersList = request.headers
    const ip = headersList.get('x-forwarded-for')?.split(',')[0] || headersList.get('x-real-ip') || 'unknown'

    let limitType: keyof typeof LIMITS = 'api'
    if (pathname.includes('login') || pathname.includes('password')) {
        limitType = 'login'
    } else if (pathname.includes('otp')) {
        limitType = 'otp'
    }

    const rateLimitKey = `${ip}:${limitType}`

    if (!checkRateLimit(rateLimitKey, limitType)) {
        return new NextResponse(
            JSON.stringify({ error: 'Too many requests. Please try again later.' }),
            {
                status: 429,
                headers: { 'Content-Type': 'application/json' }
            }
        )
    }

    // 3. Authentication & Routing Protection
    const sessionToken = request.cookies.get('session')?.value
    let user: any = null

    if (sessionToken) {
        user = await verifySessionToken(sessionToken)
    }

    const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/register')

    // Protected Routes Definition
    const isSuperAdminRoute = pathname.startsWith('/superadmin')
    const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/campus') || pathname.startsWith('/finance')
    const isDashboardRoute =
        pathname.startsWith('/dashboard') ||
        pathname.startsWith('/referrals') ||
        pathname.startsWith('/earnings') ||
        pathname.startsWith('/profile') ||
        pathname.startsWith('/tickets') ||
        pathname.startsWith('/support') ||
        pathname.startsWith('/analytics') ||
        pathname.startsWith('/notifications') ||
        pathname.startsWith('/marketing') ||
        pathname.startsWith('/leaderboard') ||
        pathname.startsWith('/program-leads') ||
        pathname.startsWith('/rules')

    // Is it a protected route?
    const isProtectedRoute = isSuperAdminRoute || isAdminRoute || isDashboardRoute

    // Logic:
    // A. If Authenticated
    if (user) {
        // [DISABLED] Strict redirect loops for Pending users on mobile as they cause app exits
        /*
        if (user.status === 'Pending' && pathname.startsWith('/dashboard')) {
            console.log(`[AUTH] Hard Block: Redirecting Pending user ${user.userId} to payment step`);
            return NextResponse.redirect(new URL('/?step=payment', request.url))
        }
        */

        // 1. If trying to access Auth pages (Login/Register), redirect to dashboard
        if (isAuthRoute) {
            if (user.role === 'Super Admin') return NextResponse.redirect(new URL('/superadmin', request.url))
            if (user.userType === 'admin') return NextResponse.redirect(new URL('/admin', request.url)) // Or their specific dashboard

            // If user is pending, they should go to payment step even if they try to go to /login or /register
            if (user.status === 'Pending') return NextResponse.redirect(new URL('/?step=payment', request.url))

            return NextResponse.redirect(new URL('/dashboard', request.url))
        }

        // Super Admin Only (except for shared modules like approvals, referrals for Admission Admin, and users for Finance/Admission Admin)
        const isSharedAdminRoute = (pathname.startsWith('/superadmin/approvals') && user.userType === 'admin') ||
                                 (pathname.startsWith('/superadmin/referrals') && user.userType === 'admin' && user.role === 'Admission Admin') ||
                                 (pathname.startsWith('/superadmin/users') && user.userType === 'admin' && (user.role === 'Finance Admin' || user.role === 'Admission Admin'))

        if (isSuperAdminRoute && user.role !== 'Super Admin' && !isSharedAdminRoute) {
            return NextResponse.redirect(new URL('/dashboard', request.url))
        }

        if (isSuperAdminRoute && user.role === 'Super Admin' && user.is2faVerified === false) {
            return NextResponse.redirect(new URL('/auth/verify-2fa', request.url))
        }

        // Admin Routes (Campus, Finance, etc.)
        if (isAdminRoute && user.userType !== 'admin') {
            return NextResponse.redirect(new URL('/dashboard', request.url))
        }
    } else {
        // B. If Not Authenticated
        // 1. If accessing protected route, redirect to login
        if (isProtectedRoute) {
            const redirectUrl = new URL('/', request.url)
            // Optional: Preserve redirect URL
            // redirectUrl.searchParams.set('from', pathname)
            return NextResponse.redirect(redirectUrl)
        }
    }

    // Generate a unique Request ID
    const requestId = crypto.randomUUID()

    // Add Request ID to the request headers to be accessed by server actions/components
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-request-id', requestId)

    const response = NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    })

    // Set Request ID in response header for client-side debugging/tracking
    response.headers.set('x-request-id', requestId)

    // 4. Security Headers (Temporarily commented out to fix "Content Blocked" error)
    response.headers.set('X-Frame-Options', 'SAMEORIGIN')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    response.headers.set('X-XSS-Protection', '1; mode=block')
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

    // HSTS
    if (process.env.NODE_ENV === 'production') {
        response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    }

    // CSP - Optimized for Cashfree, GrayQuest & Capacitor Mobile
    const isProd = process.env.NODE_ENV === 'production'
    const csp = [
        "default-src 'self' blob: capacitor: http://localhost:*",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.cashfree.com https://payments.cashfree.com https://payments.grayquest.com https://grayquest.com https://checkout.grayquest.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: https: blob:",
        "frame-src 'self' capacitor: https://sdk.cashfree.com https://api.cashfree.com https://sandbox.cashfree.com https://payments.cashfree.com https://payments-test.cashfree.com https://payments.grayquest.com https://grayquest.com https://checkout.grayquest.com",
        "connect-src 'self' capacitor: http://localhost:* https://api.cashfree.com https://sandbox.cashfree.com https://payments.cashfree.com https://payments-test.cashfree.com https://payments.grayquest.com https://grayquest.com https://checkout.grayquest.com",
    ].join('; ')
    response.headers.set('Content-Security-Policy', csp)

    if (pathname.startsWith('/api/') && origin && allowedOrigins.has(origin)) {
        response.headers.set('Access-Control-Allow-Origin', origin)
        response.headers.set('Access-Control-Allow-Credentials', 'true')
        response.headers.set('Vary', 'Origin')
    }

    return response
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!_next/static|_next/image|favicon.ico|policies).*)',
    ],
}
