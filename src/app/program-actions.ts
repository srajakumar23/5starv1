'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth-service'
import { getMyPermissions, hasPermission } from '@/lib/permission-service'
import { runSyncProgramLeads } from '@/lib/program-sync-service'

/**
 * Fetch all active external programs for the Ambassador Gallery
 */
export async function getActivePrograms() {
    try {
        const now = new Date()
        // Create a date for the start of today (midnight) to make endDate inclusive
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

        const programs = await prisma.externalProgram.findMany({
            where: {
                isActive: true,
                AND: [
                    {
                        OR: [
                            { endDate: null },
                            { endDate: { gte: startOfToday } }
                        ]
                    },
                    {
                        OR: [
                            { startDate: null },
                            { startDate: { lte: now } }
                        ]
                    }
                ]
            },
            orderBy: { createdAt: 'desc' }
        })

        return { success: true, programs }
    } catch (error) {
        console.error('Error fetching programs:', error)
        return { success: false, error: 'Failed to load campaigns' }
    }
}

/**
 * Fetch ALL programs for Admin Management (Includes Future/Expired)
 */
export async function getAllPrograms() {
    try {
        const programs = await prisma.externalProgram.findMany({
            // No Date Filter for Admin
            orderBy: { createdAt: 'desc' }
        })
        return { success: true, programs }
    } catch (error) {
        console.error('Error fetching all programs:', error)
        return { success: false, error: 'Failed to load campaigns' }
    }
}

/**
 * (Admin) Create a new External Program
 */
export async function createExternalProgram(data: {
    title: string
    slug: string
    targetUrl: string
    description?: string
    commissionAmount?: number
    rewardType?: 'CASH' | 'POINTS' | 'NONE'
    autoSyncUrl?: string
    startDate?: Date
    endDate?: Date
}) {


    try {
        const user = await getCurrentUser()
        if (!user) throw new Error('Unauthorized')

        const permissions = await getMyPermissions()
        if (!permissions?.externalPrograms?.canCreate) {
            // Fallback for Super Admin
            if (!user.role.includes('Super Admin')) throw new Error('Unauthorized')
        }

        const program = await prisma.externalProgram.create({
            data: {
                title: data.title,
                slug: data.slug,
                targetUrl: data.targetUrl,
                description: data.description,
                commissionAmount: data.commissionAmount || 0,
                rewardType: data.rewardType || 'NONE',
                autoSyncUrl: data.autoSyncUrl,
                startDate: data.startDate,
                endDate: data.endDate,
                isActive: true
            }
        })

        revalidatePath('/dashboard')
        revalidatePath('/superadmin')

        // Trigger broadcast notification to all active users
        const { notifyProgramLaunch } = await import('@/lib/notification-helper')
        notifyProgramLaunch(program.title, program.slug).catch(err => {
            console.error('Failed to broadcast program launch notification:', err)
        })

        return { success: true, program }
    } catch (error) {
        console.error('Error creating program:', error)
        return { success: false, error: 'Failed to create program' }
    }
}

/**
 * (Admin) Update an existing External Program
 */
export async function updateExternalProgram(id: number, data: {
    title: string
    slug: string
    targetUrl: string
    description?: string
    commissionAmount?: number
    rewardType?: 'CASH' | 'POINTS' | 'NONE'
    autoSyncUrl?: string
    isActive?: boolean
    startDate?: Date
    endDate?: Date
}) {
    try {
        const user = await getCurrentUser()
        if (!user) throw new Error('Unauthorized')

        const permissions = await getMyPermissions()
        if (!permissions?.externalPrograms?.canEdit) {
            if (!user.role.includes('Super Admin')) throw new Error('Unauthorized')
        }

        const program = await prisma.externalProgram.update({
            where: { id },
            data: {
                title: data.title,
                slug: data.slug,
                targetUrl: data.targetUrl,
                description: data.description,
                commissionAmount: data.commissionAmount || 0,
                rewardType: data.rewardType || 'NONE',
                autoSyncUrl: data.autoSyncUrl,
                isActive: data.isActive,
                startDate: data.startDate,
                endDate: data.endDate
            }
        })
        revalidatePath('/dashboard')
        revalidatePath('/superadmin')
        return { success: true, program }
    } catch (error) {
        console.error('Error updating program:', error)
        return { success: false, error: 'Failed to update program' }
    }
}

/**
 * Capture a new Lead (Click Tracking)
 */
export async function captureProgramLead(data: {
    slug: string
    referralCode: string
    visitorMobile: string
    visitorName?: string
}) {
    try {
        // 1. Find Program
        const program = await prisma.externalProgram.findUnique({
            where: { slug: data.slug }
        })
        if (!program || !program.isActive) return { success: false, error: 'Program not found or inactive' }

        // Check Validity Dates
        const now = new Date()
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

        if (program.startDate && now < program.startDate) {
            return { success: false, error: 'Program has not started yet' }
        }
        if (program.endDate && startOfToday > program.endDate) {
            return { success: false, error: 'Program has ended' }
        }

        // 2. Find Referrer
        const referrer = await prisma.user.findUnique({
            where: { referralCode: data.referralCode }
        })
        if (!referrer) return { success: false, error: 'Invalid referral code' }

        // 3. Create Lead
        // Check duplicate? For clicks, we might allow multiple, but let's debounce duplicates within 1 hour in future.
        // For now, simple insert.
        await prisma.programLead.create({
            data: {
                programId: program.id,
                referrerId: referrer.userId,
                visitorMobile: data.visitorMobile,
                visitorName: data.visitorName || 'Anonymous',
                status: 'CLICKED'
            }
        })

        return { success: true, targetUrl: program.targetUrl }
    } catch (error) {
        console.error('Error capturing lead:', error)
        return { success: false, error: 'Failed to process lead' }
    }
}

export async function syncProgramLeads() {
    const user = await getCurrentUser()
    if (
        !user ||
        (user.role !== 'Super Admin' &&
            !(await hasPermission('externalPrograms')) &&
            !(await hasPermission('programLeads')))
    ) {
        return { success: false as const, error: 'Unauthorized', results: [] as any[] }
    }
    return runSyncProgramLeads()
}
