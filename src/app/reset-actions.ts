'use server'

import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth-service"
import { logAction } from "@/lib/audit-logger"

/**
 * PRODUCTION RESET TOOL
 * Clears all transactional data (Users, Students, Referrals) inside an atomic transaction.
 * Preserves: Admins, Campuses, Settings
 */
export async function resetDatabase(confirmation: string) {
    const user = await getCurrentUser()

    // 1. Strict Authorization Check
    if (!user || user.role !== 'Super Admin') {
        return { success: false, error: 'Unauthorized: Only Super Admin can perform this action' }
    }

    // 2. Confirmation Check
    if (confirmation !== 'DELETE') {
        return { success: false, error: 'Invalid confirmation code' }
    }

    try {
        // 3. Atomic Execution (Strict reverse foreign-key dependency order)
        const counts = await prisma.$transaction(async (tx) => {
            await tx.otpVerification.deleteMany({})
            await tx.notification.deleteMany({})
            await tx.deviceToken.deleteMany({})
            await tx.ticketMessage.deleteMany({})
            await tx.supportTicket.deleteMany({})
            await tx.programLead.deleteMany({})
            await tx.payment.deleteMany({})

            const settlements = await tx.settlement.deleteMany({})
            // Student.referralLeadId references ReferralLead.leadId -> delete Students BEFORE ReferralLeads
            const students = await tx.student.deleteMany({})
            const leads = await tx.referralLead.deleteMany({})
            const users = await tx.user.deleteMany({})

            return {
                users: users.count,
                students: students.count,
                leads: leads.count,
                settlements: settlements.count
            }
        }, { timeout: 60000 })

        // 4. Audit Log
        await logAction(
            'DELETE',
            'system',
            `DATABASE RESET performed by ${'adminName' in user ? user.adminName : user.fullName}`,
            'ALL',
            null,
            { deleted: { users: counts.users, students: counts.students, leads: counts.leads } }
        )

        return {
            success: true,
            counts
        }

    } catch (error: any) {
        console.error('Database Reset Error:', error)
        return { success: false, error: error.message || 'Failed to reset database' }
    }
}
