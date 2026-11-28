'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth-service'
import { syncUserStats as runSyncUserStats } from '@/lib/sync-service'

/**
 * Centrally synchronizes a user's status based on student records and referral leads.
 * Enforces ownership/admin RBAC and omits raw PII fields from the response.
 */
export async function syncUserStats(userId: number) {
    const actor = await getCurrentUser()
    if (
        !actor ||
        (Number(actor.userId) !== Number(userId) &&
            !actor.role.includes('Admin') &&
            !actor.role.includes('Campus'))
    ) {
        return { success: false, error: 'Unauthorized' }
    }

    const res = await runSyncUserStats(userId)
    return {
        success: res.success,
        error: res.error,
    }
}

/**
 * Utility to revalidate all dashboard-related paths
 */
export async function revalidateDashboard() {
    const actor = await getCurrentUser()
    if (!actor || (!actor.role.includes('Admin') && !actor.role.includes('Campus'))) {
        return { success: false, error: 'Unauthorized' }
    }

    revalidatePath('/superadmin')
    revalidatePath('/superadmin/users')
    revalidatePath('/superadmin/students')
    revalidatePath('/superadmin/verification')
    revalidatePath('/dashboard')
    revalidatePath('/profile')
    revalidatePath('/students')
    revalidatePath('/campus')
    return { success: true }
}
