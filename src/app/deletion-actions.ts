'use server'

import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-service'
import { revalidatePath } from 'next/cache'
import { logAction } from '@/lib/audit-logger'
import { ensureUserReferralCode } from '@/lib/referral-service'

/**
 * User requests their account to be deleted (Ambassadors / Parents only)
 */
export async function requestAccountDeletion() {
    const user = await getCurrentUser()
    if (!user || ('adminId' in user && (user as any).adminId) || !('userId' in user)) {
        return { success: false, error: 'Unauthorized' }
    }

    if ((user as any).status === 'Deletion_Requested') {
        return { success: true }
    }

    try {
        await prisma.user.update({
            where: { userId: Number(user.userId) },
            data: {
                status: 'Deletion_Requested',
                deletionRequestedAt: new Date()
            }
        })

        await logAction('UPDATE', 'user', `Account deletion requested by ${user.fullName}`, String(user.userId))
        revalidatePath('/profile')
        revalidatePath('/superadmin')
        return { success: true }
    } catch (error) {
        console.error('Request Deletion Error:', error)
        return { success: false, error: 'Failed to request deletion' }
    }
}

/**
 * User withdraws their pending account closure request before Super Admin approval
 */
export async function cancelAccountDeletion() {
    const user = await getCurrentUser()
    if (!user || ('adminId' in user && (user as any).adminId) || !('userId' in user)) {
        return { success: false, error: 'Unauthorized' }
    }

    try {
        const dbUser = await prisma.user.findUnique({
            where: { userId: Number(user.userId) },
            select: { status: true, paymentStatus: true }
        })

        if (!dbUser || dbUser.status !== 'Deletion_Requested') {
            return { success: false, error: 'No pending deletion request found' }
        }

        const restoredStatus =
            dbUser.paymentStatus === 'Success' || dbUser.paymentStatus === 'Completed'
                ? 'Active'
                : 'Pending'

        await prisma.user.update({
            where: { userId: Number(user.userId) },
            data: {
                status: restoredStatus,
                deletionRequestedAt: null
            }
        })

        await logAction('UPDATE', 'user', `Account deletion request cancelled by ${user.fullName}`, String(user.userId))
        revalidatePath('/profile')
        revalidatePath('/superadmin')
        return { success: true, status: restoredStatus }
    } catch (error) {
        console.error('Cancel Deletion Error:', error)
        return { success: false, error: 'Failed to cancel deletion request' }
    }
}

/**
 * Super Admin fetches all deletion requests
 */
export async function getDeletionRequests() {
    const admin = await getCurrentUser()
    if (!admin || !('role' in admin) || admin.role !== 'Super Admin') {
        return { success: false, error: 'Unauthorized' }
    }

    try {
        const requests = await prisma.user.findMany({
            where: { status: 'Deletion_Requested' },
            select: {
                userId: true,
                fullName: true,
                mobileNumber: true,
                role: true,
                deletionRequestedAt: true,
                referralCode: true,
                createdAt: true
            },
            orderBy: { deletionRequestedAt: 'desc' }
        })

        return { success: true, data: requests }
    } catch (error) {
        console.error('Get Deletion Requests Error:', error)
        return { success: false, error: 'Failed to fetch requests' }
    }
}

/**
 * Super Admin approves deletion (Data scrubbing / Soft delete)
 */
export async function approveDeletion(userId: number) {
    const admin = await getCurrentUser()
    if (!admin || !('role' in admin) || admin.role !== 'Super Admin') {
        return { success: false, error: 'Unauthorized' }
    }

    try {
        // We do a "soft delete" - scrub personal data but keep the record 
        // to maintain database integrity (referrals, students linked).
        await prisma.user.update({
            where: { userId },
            data: {
                status: 'Deleted',
                fullName: 'Deleted User',
                mobileNumber: `DELETED-${userId}-${Date.now()}`, // Unique dummy number
                email: null,
                address: null,
                profileImage: null,
                bankAccountDetails: null,
                accountNumber: null,
                bankName: null,
                ifscCode: null,
                aadharNo: null,
                empId: null,
                childName: null,
                childEprNo: null,
                fcmToken: null,
                password: null, // Clear password so they can't login
            }
        })

        await prisma.deviceToken.deleteMany({ where: { userId } })

        await logAction('DELETE', 'user', `Account deletion APPROVED for user ID ${userId}`, String(userId))
        revalidatePath('/superadmin')
        return { success: true }
    } catch (error) {
        console.error('Approve Deletion Error:', error)
        return { success: false, error: 'Failed to approve deletion' }
    }
}

/**
 * Super Admin rejects deletion
 */
export async function rejectDeletion(userId: number) {
    const admin = await getCurrentUser()
    if (!admin || !('role' in admin) || admin.role !== 'Super Admin') {
        return { success: false, error: 'Unauthorized' }
    }

    try {
        await prisma.user.update({
            where: { userId },
            data: {
                status: 'Active',
                deletionRequestedAt: null
            }
        })

        await ensureUserReferralCode(userId)

        await logAction('UPDATE', 'user', `Account deletion REJECTED for user ID ${userId}`, String(userId))
        revalidatePath('/superadmin')
        return { success: true }
    } catch (error) {
        console.error('Reject Deletion Error:', error)
        return { success: false, error: 'Failed to reject deletion' }
    }
}
