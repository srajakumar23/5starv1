import 'server-only'
import { getSession } from './session'
import prisma, { withRetry } from './prisma'
import { cache } from 'react'

import { mapAdminRole, mapUserRole } from './enum-utils'

const getCurrentUserCached = cache(async (includeCount: boolean) => {
    const session: any = await getSession()
    if (!session || !session.userId) return null

    try {
        if (session.userType === 'admin') {
            const admin = await withRetry(() => prisma.admin.findUnique({
                where: { adminId: Number(session.userId) }
            }))
            if (!admin || admin.status !== 'Active') {
                return null
            }

            // Resolve campusId if assignedCampus is present (Critical for permission scoping)
            let campusId = null
            let resolvedCampusName = admin.assignedCampus
                ? (admin.assignedCampus.trim().toUpperCase() === 'ABSM - MUTHIYALPET' ? 'ABSM -SVP' : admin.assignedCampus.trim())
                : null

            if (resolvedCampusName) {
                let campus = await withRetry(() => prisma.campus.findUnique({
                    where: { campusName: resolvedCampusName! },
                    select: { id: true, campusName: true, isActive: true }
                }))
                if (!campus) {
                    campus = await withRetry(() => prisma.campus.findFirst({
                        where: {
                            OR: [
                                { campusName: { equals: resolvedCampusName!, mode: 'insensitive' } },
                                { campusHeadId: admin.adminId }
                            ]
                        },
                        select: { id: true, campusName: true, isActive: true }
                    }))
                }
                if (campus) {
                    // BLOCK LOGIN IF CAMPUS IS INACTIVE
                    if (!campus.isActive && mapAdminRole(admin.role) !== 'Super Admin') {
                        return null
                    }
                    campusId = campus.id
                    resolvedCampusName = campus.campusName
                }
            }

            // Map to User-like structure for compatibility
            return {
                ...admin,
                assignedCampus: resolvedCampusName,
                userId: admin.adminId,
                campusId,
                fullName: admin.adminName,
                mobileNumber: admin.adminMobile,
                role: mapAdminRole(admin.role)
            }
        }

        const user = await withRetry(() => prisma.user.findUnique({
            where: { userId: Number(session.userId) }
        }))

        if (user) {
            if (user.status === 'Deleted' || user.status === 'Suspended') {
                return null
            }

            let finalUser = {
                ...user,
                role: mapUserRole(user.role)
            }

            if (!user.assignedCampus && user.campusId) {
                const campus = await withRetry(() => prisma.campus.findUnique({
                    where: { id: user.campusId! },
                    select: { campusName: true }
                }))
                if (campus) {
                    finalUser = { ...finalUser, assignedCampus: campus.campusName }
                }
            }
            // Calculate current year confirmed referrals for Dual Track Benefit display
            let currentYearCount = 0
            if (includeCount) {
                const currentYearStart = new Date(new Date().getFullYear(), 0, 1)
                currentYearCount = await withRetry(() => prisma.referralLead.count({
                    where: {
                        userId: user.userId,
                        leadStatus: 'Confirmed',
                        confirmedDate: { gte: currentYearStart }
                    }
                })).catch(() => 0) // Defensive count
            }

            return { ...finalUser, currentYearCount }
        }
    } catch (dbError) {
        console.error('getCurrentUser: Database unreachable:', (dbError as any).message)
        return null
    }

    return null
})

export async function getCurrentUser(options: { includeCount?: boolean } = {}) {
    return getCurrentUserCached(Boolean(options.includeCount))
}
