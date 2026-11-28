'use server'

import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth-service"
import { logAction } from "@/lib/audit-logger"

/**
 * BACKUP DATABASE
 * Exports all critical system data as a JSON object.
 * Restricted to Super Admin.
 */
export async function backupDatabase() {
    const user = await getCurrentUser()

    if (!user || user.role !== 'Super Admin') {
        return { success: false, error: 'Unauthorized' }
    }

    try {
        const timestamp = new Date().toISOString()

        // Defensive fetching: catch individual table errors to prevent one failure from breaking the whole backup
        const [
            users,
            students,
            leads,
            admins,
            campuses,
            feeStructures,
            settings,
            settlements,
            payments,
            benefitSlabs,
            academicYears,
            rolePermissions,
            campusTargets,
            externalPrograms,
            programLeads,
            whatsappConfigs,
            automationRules
        ] = await Promise.all([
            prisma.user.findMany().catch(e => { console.error('Backup: User table failed', e.message); return [] }),
            prisma.student.findMany().catch(e => { console.error('Backup: Student table failed', e.message); return [] }),
            prisma.referralLead.findMany().catch(e => { console.error('Backup: Lead table failed', e.message); return [] }),
            prisma.admin.findMany().catch(e => { console.error('Backup: Admin table failed', e.message); return [] }),
            prisma.campus.findMany().catch(e => { console.error('Backup: Campus table failed', e.message); return [] }),
            prisma.gradeFee.findMany().catch(e => { console.error('Backup: GradeFee table failed', e.message); return [] }),
            prisma.systemSettings.findFirst().catch(e => { console.error('Backup: SystemSettings failed', e.message); return null }),
            prisma.settlement.findMany().catch(e => { console.error('Backup: Settlement table failed', e.message); return [] }),
            prisma.payment.findMany().catch(e => { console.error('Backup: Payment table failed', e.message); return [] }),
            prisma.benefitSlab.findMany().catch(e => { console.error('Backup: BenefitSlab table failed', e.message); return [] }),
            prisma.academicYear.findMany().catch(e => { console.error('Backup: AcademicYear table failed', e.message); return [] }),
            prisma.rolePermissions.findMany().catch(e => { console.error('Backup: RolePermissions table failed', e.message); return [] }),
            prisma.campusTarget.findMany().catch(e => { console.error('Backup: CampusTarget table failed', e.message); return [] }),
            prisma.externalProgram.findMany().catch(e => { console.error('Backup: ExternalProgram table failed', e.message); return [] }),
            prisma.programLead.findMany().catch(e => { console.error('Backup: ProgramLead table failed', e.message); return [] }),
            prisma.whatsAppConfig.findMany().catch(e => { console.error('Backup: WhatsAppConfig table failed', e.message); return [] }),
            prisma.automationRule.findMany().catch(e => { console.error('Backup: AutomationRule table failed', e.message); return [] })
        ])

        const exporterName = 'adminName' in user ? user.adminName : user.fullName
        const backupData = {
            metadata: {
                version: '1.1',
                timestamp,
                exportedBy: exporterName,
                partial: (!users.length || !settings) // Flag if major parts are missing
            },
            data: {
                users,
                students,
                leads,
                admins,
                campuses,
                feeStructures,
                settings,
                settlements,
                payments,
                benefitSlabs,
                academicYears,
                rolePermissions,
                campusTargets,
                externalPrograms,
                programLeads,
                whatsappConfigs,
                automationRules
            }
        }

        const stats = {
            users: users.length,
            students: students.length,
            leads: leads.length,
            settlements: settlements.length,
            payments: payments.length,
            size: JSON.stringify(backupData).length
        }

        await logAction(
            'EXPORT',
            'system',
            `DATABASE BACKUP created by ${exporterName}`,
            'ALL',
            null,
            stats
        )

        return { success: true, data: backupData }
    } catch (error: any) {
        console.error('Backup Error (Critical):', error)
        return { success: false, error: 'Backup Engine Error: ' + (error.message || 'Unknown') }
    }
}


/**
 * RESTORE DATABASE
 * Wipes current data and restores from a backup object in strict FK order.
 * Restricted to Super Admin.
 */
export async function restoreDatabase(backupData: any) {
    const user = await getCurrentUser()

    if (!user || user.role !== 'Super Admin') {
        return { success: false, error: 'Unauthorized' }
    }

    if (!backupData || !backupData.data) {
        return { success: false, error: 'Invalid backup data format' }
    }

    const {
        users,
        students,
        leads,
        admins,
        campuses,
        feeStructures,
        settings,
        settlements,
        payments,
        benefitSlabs,
        academicYears,
        rolePermissions,
        campusTargets,
        externalPrograms,
        programLeads,
        whatsappConfigs,
        automationRules
    } = backupData.data

    try {
        await prisma.$transaction(async (tx) => {
            // 1. DELETE EXISTING DATA (Strict Reverse FK Dependency Order)
            await tx.otpVerification.deleteMany({})
            await tx.notification.deleteMany({})
            await tx.ticketMessage.deleteMany({})
            await tx.supportTicket.deleteMany({})
            await tx.settlement.deleteMany({})
            await tx.payment.deleteMany({})
            await tx.programLead.deleteMany({})
            await tx.externalProgram.deleteMany({})

            // Student -> ReferralLead, User, Campus
            await tx.student.deleteMany({})
            await tx.referralLead.deleteMany({})
            await tx.user.deleteMany({})
            await tx.admin.deleteMany({})

            // Campus children before Campus
            await tx.campusTarget.deleteMany({})
            await tx.gradeFee.deleteMany({})
            await tx.campus.deleteMany({})
            await tx.systemSettings.deleteMany({})

            // Only wipe configuration tables when present in the backup archive (preserves backward compatibility with v1.0)
            if (Array.isArray(benefitSlabs)) await tx.benefitSlab.deleteMany({})
            if (Array.isArray(academicYears)) await tx.academicYear.deleteMany({})
            if (Array.isArray(rolePermissions)) await tx.rolePermissions.deleteMany({})
            if (Array.isArray(whatsappConfigs)) await tx.whatsAppConfig.deleteMany({})
            if (Array.isArray(automationRules)) await tx.automationRule.deleteMany({})

            // 2. RESTORE DATA (Strict FK Dependency Order)
            if (settings) {
                await tx.systemSettings.create({ data: settings })
            }

            // Campuses MUST be created BEFORE gradeFee and campusTargets
            if (campuses && campuses.length > 0) {
                await tx.campus.createMany({ data: campuses })
            }

            if (feeStructures && feeStructures.length > 0) {
                await tx.gradeFee.createMany({ data: feeStructures })
            }

            if (campusTargets && campusTargets.length > 0) {
                await tx.campusTarget.createMany({ data: campusTargets })
            }

            if (benefitSlabs && benefitSlabs.length > 0) {
                await tx.benefitSlab.createMany({ data: benefitSlabs })
            }

            if (academicYears && academicYears.length > 0) {
                await tx.academicYear.createMany({ data: academicYears })
            }

            if (rolePermissions && rolePermissions.length > 0) {
                await tx.rolePermissions.createMany({ data: rolePermissions })
            }

            if (whatsappConfigs && whatsappConfigs.length > 0) {
                await tx.whatsAppConfig.createMany({ data: whatsappConfigs })
            }

            if (automationRules && automationRules.length > 0) {
                await tx.automationRule.createMany({ data: automationRules })
            }

            if (admins && admins.length > 0) {
                await tx.admin.createMany({ data: admins })
            }

            if (users && users.length > 0) {
                await tx.user.createMany({ data: users })
            }

            // ReferralLeads MUST be created BEFORE Students (Student.referralLeadId -> ReferralLead.leadId)
            if (leads && leads.length > 0) {
                await tx.referralLead.createMany({ data: leads })
            }

            if (students && students.length > 0) {
                await tx.student.createMany({ data: students })
            }

            if (payments && payments.length > 0) {
                await tx.payment.createMany({ data: payments })
            }

            if (settlements && settlements.length > 0) {
                await tx.settlement.createMany({ data: settlements })
            }

            if (externalPrograms && externalPrograms.length > 0) {
                await tx.externalProgram.createMany({ data: externalPrograms })
            }

            if (programLeads && programLeads.length > 0) {
                await tx.programLead.createMany({ data: programLeads })
            }
        }, { timeout: 60000 })

        await logAction(
            'IMPORT',
            'system',
            `DATABASE RESTORE performed by ${'adminName' in user ? user.adminName : user.fullName}`,
            'ALL',
            null,
            { restored_from: backupData.metadata?.timestamp }
        )

        return { success: true }

    } catch (error: any) {
        console.error('Restore Error:', error)
        return { success: false, error: 'Failed to restore database: ' + error.message }
    }
}
