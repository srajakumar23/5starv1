'use server'

import { getSession, createSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { logAction } from '@/lib/audit-logger'

/**
 * Verifies the 4-digit OTP for 2FA and upgrades the session.
 */
export async function verifyTwoFactorAction(otp: string) {
    try {
        const session: any = await getSession()
        if (!session || !session.userId) {
            return { success: false, error: 'Session expired. Please login again.' }
        }

        // 1. Resolve account mobile number from DB
        let mobile: string | null = null
        if (session.userType === 'admin') {
            const admin = await prisma.admin.findUnique({
                where: { adminId: Number(session.userId) },
                select: { adminMobile: true, status: true }
            })
            if (!admin || admin.status !== 'Active') {
                return { success: false, error: 'Account inactive or not found.' }
            }
            mobile = admin.adminMobile
        } else {
            const user = await prisma.user.findUnique({
                where: { userId: Number(session.userId) },
                select: { mobileNumber: true, status: true }
            })
            if (!user || user.status === 'Deleted' || user.status === 'Suspended') {
                return { success: false, error: 'Account inactive or not found.' }
            }
            mobile = user.mobileNumber
        }

        if (!mobile) {
            return { success: false, error: 'Mobile number not configured for 2FA.' }
        }

        const cleanOtp = (otp || '').trim()
        const limitKey = `verify:2fa:${mobile}`
        const now = new Date()
        const limitRecord = await prisma.rateLimit.findUnique({ where: { key: limitKey } })
        if (limitRecord && limitRecord.resetAt > now && limitRecord.count >= 5) {
            return { success: false, error: 'Too many failed attempts. Please wait 15 minutes.' }
        }

        const record = await prisma.otpVerification.findUnique({ where: { mobile } })
        const isDevMock = process.env.NODE_ENV === 'development' && !process.env.SMS_PROVIDER && cleanOtp === '1234'
        const isValidDbOtp = !!record && now <= record.expiresAt && record.otp === cleanOtp

        if (!isValidDbOtp && !isDevMock) {
            await prisma.rateLimit.upsert({
                where: { key: limitKey },
                update: { count: { increment: 1 } },
                create: { key: limitKey, count: 1, resetAt: new Date(now.getTime() + 15 * 60 * 1000) }
            })
            return { success: false, error: 'Invalid or expired verification code' }
        }

        await prisma.rateLimit.delete({ where: { key: limitKey } }).catch(() => null)
        if (record) {
            await prisma.otpVerification.delete({ where: { mobile } }).catch(() => null)
        }

        // Upgrade session: re-create session with is2faVerified = true
        await createSession(
            session.userId,
            session.userType,
            session.role,
            true, // is2faVerified
            session.status
        )

        await logAction('LOGIN', 'auth', `2FA verified for ${session.userType} ${session.userId}`, session.userId.toString())

        revalidatePath('/superadmin')
        return { success: true }
    } catch (error) {
        console.error('2FA Verification Error:', error)
        return { success: false, error: 'Verification failed' }
    }
}
