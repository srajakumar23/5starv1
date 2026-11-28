'use server'

import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth-service"
import { logAction } from "@/lib/audit-logger"
import { revalidatePath } from 'next/cache'

/**
 * Schedules a broadcast to users with missing campus information.
 */
export async function triggerCampusEnforcementBroadcast() {
    const admin = await getCurrentUser()
    if (!admin || admin.role !== 'Super Admin') {
        return { success: false, error: 'Unauthorized: Super Admin access required' }
    }

    try {
        // 1. Check for existing pending job
        const existingJob = await prisma.job.findFirst({
            where: {
                type: 'SYSTEM_ENFORCEMENT',
                status: 'PENDING'
            }
        })

        if (existingJob) {
            return { success: false, error: 'Campus enforcement is already scheduled and awaiting processing.' }
        }

        // 2. Create Background Job
        await prisma.job.create({
            data: {
                type: 'SYSTEM_ENFORCEMENT',
                status: 'PENDING',
                payload: {}
            }
        })

        await logAction('Schedule Campus Enforcement', 'system', `Scheduled campus enforcement broadcast`, admin.userId.toString())

        return {
            success: true,
            message: 'Enforcement broadcast scheduled successfully.'
        }

    } catch (error: any) {
        console.error('Campus Enforcement Schedule Error:', error)
        return { success: false, error: error.message || 'Failed to schedule broadcast' }
    }
}

/**
 * Fetches stats for users requiring campus update
 */
export async function getCampusEnforcementStats() {
    const admin = await getCurrentUser()
    if (!admin) return { success: false, error: 'Unauthorized' }

    try {
        const count = await prisma.user.count({
            where: {
                role: { in: ['Parent', 'Staff', 'Alumni'] },
                campusId: null,
                assignedCampus: null,
                status: { not: 'Deleted' }
            }
        })

        return { success: true, count }
    } catch (error) {
        return { success: false, error: 'Failed to fetch stats' }
    }
}
