'use server'

import prisma from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { getCurrentUser } from '@/lib/auth-service'
import { logAction } from '@/lib/audit-logger'

// Helper to check if user is admin
async function checkAdmin() {
    const user = await getCurrentUser()
    if (!user || user.role === 'Parent' || user.role === 'Staff' || user.role === 'Alumni' || user.role === 'Others') {
        throw new Error('Unauthorized: Admin access required')
    }
    return user
}

/**
 * Schedules a re-engagement campaign for ambassadors inactive for 14+ days.
 * Only callable by Super Admins.
 */
export async function triggerReengagementCampaign() {
    const admin = await getCurrentUser()
    if (!admin || admin.role !== 'Super Admin') {
        return { success: false, error: 'Unauthorized: Super Admin access required' }
    }

    try {
        // Check for existing pending system jobs to avoid double scheduling
        const existingJob = await prisma.job.findFirst({
            where: {
                type: 'SYSTEM_REENGAGEMENT',
                status: 'PENDING'
            }
        })

        if (existingJob) {
            return { success: false, error: 'Re-engagement is already scheduled and awaiting processing.' }
        }

        // Create the background job
        await prisma.job.create({
            data: {
                type: 'SYSTEM_REENGAGEMENT',
                status: 'PENDING',
                payload: {}
            }
        })

        await logAction(
            'Schedule Re-engagement',
            'engagement',
            `Scheduled system-wide re-engagement audit`,
            undefined,
            admin.userId
        )

        return { success: true, message: 'Re-engagement campaign scheduled successfully.' }
    } catch (error) {
        logger.error('Failed to schedule re-engagement:', error)
        return { success: false, error: 'Failed to schedule campaign' }
    }
}

export async function getEngagementStats() {
    try {
        await checkAdmin()

        const [campaignCount, totalSentResult, dormantCount, activeJobs] = await Promise.all([
            prisma.campaign.count(),
            prisma.campaignLog.aggregate({ _sum: { sentCount: true } }),
            prisma.user.count({
                where: {
                    status: 'Active',
                    role: { in: ['Staff', 'Alumni', 'Parent'] },
                    referrals: {
                        none: {
                            createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) }
                        }
                    }
                }
            }),
            prisma.job.findMany({
                where: {
                    type: { in: ['SYSTEM_REENGAGEMENT', 'SYSTEM_ENFORCEMENT'] },
                    status: { in: ['PENDING', 'PROCESSING'] }
                },
                select: { type: true, status: true }
            })
        ])

        return {
            success: true,
            stats: {
                totalCampaigns: campaignCount,
                totalEmailsSent: totalSentResult._sum.sentCount || 0,
                dormantAmbassadors: dormantCount,
                activeJobs: activeJobs.reduce((acc, job) => {
                    acc[job.type] = job.status
                    return acc
                }, {} as Record<string, string>)
            }
        }
    } catch (error) {
        return { success: false, error: 'Failed to fetch engagement stats' }
    }
}
