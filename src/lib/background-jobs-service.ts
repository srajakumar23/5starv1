import 'server-only'
import prisma from '@/lib/prisma'
import { EmailService } from '@/lib/email-service'
import { calculateStars } from '@/lib/gamification'
import { logAction } from '@/lib/audit-logger'
import { smsService } from '@/lib/sms-service'

/**
 * Internal logic for executing re-engagement (server-only background service)
 */
export async function executeReengagementLogic() {
    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    // 1. Find all ambassadors (Staff, Alumni, Parent)
    const ambassadors = await prisma.user.findMany({
        where: {
            role: { in: ['Staff', 'Alumni', 'Parent'] },
            status: 'Active',
            email: { not: null }
        },
        include: {
            referrals: {
                orderBy: { createdAt: 'desc' },
                take: 1
            }
        }
    })

    const inactiveAmbassadors = ambassadors.filter(amb => {
        // No referrals at all or latest referral is > 14 days old
        const lastReferral = amb.referrals[0]
        if (!lastReferral) return true
        return new Date(lastReferral.createdAt) < fourteenDaysAgo
    })

    let sentCount = 0
    for (const amb of inactiveAmbassadors) {
        // 2. Check if we sent email in last 30 days
        const lastEmailLog = await prisma.activityLog.findFirst({
            where: {
                action: 'REENGAGEMENT_EMAIL_SENT',
                targetId: amb.userId.toString(),
                createdAt: { gte: thirtyDaysAgo }
            }
        })

        if (!lastEmailLog && amb.email) {
            const stars = calculateStars(amb.confirmedReferralCount)
            await EmailService.sendReengagementEmail(amb.email, amb.fullName, stars.tier)

            // 3. Log the action
            await logAction(
                'REENGAGEMENT_EMAIL_SENT',
                'engagement',
                `Sent re-engagement email to ambassador ${amb.fullName}`,
                amb.userId.toString(),
                undefined, // System actor
                { count: amb.confirmedReferralCount, tier: stars.tier }
            )
            sentCount++
        }
    }
    return sentCount
}

/**
 * Internal logic for executing campus enforcement (server-only background service)
 */
export async function executeCampusEnforcementLogic() {
    // 1. Identify users requiring update
    const affectedUsers = await prisma.user.findMany({
        where: {
            role: { in: ['Parent', 'Staff', 'Alumni'] },
            campusId: null,
            assignedCampus: null,
            status: { not: 'Deleted' }
        },
        select: {
            userId: true,
            fullName: true,
            mobileNumber: true,
            email: true,
            referralCode: true,
            createdAt: true
        }
    })

    if (affectedUsers.length === 0) {
        return { success: true, sentCount: 0 }
    }

    const { notifyCampusUpdateRequired } = await import('@/lib/notification-helper')

    let sentCount = 0
    let smsCount = 0
    let emailCount = 0

    // Process notifications
    for (const user of affectedUsers) {
        const referralCode = user.referralCode || 'N/A'
        const regDate = user.createdAt.toLocaleDateString('en-IN')

        // --- SMS Dispatch ---
        const smsMessage = `Dear Ambassador, Your Achariya Partnership Program profile is incomplete. Please update your child's campus information to activate your benefits. Login: https://achariya-app.com Profile -> Update Campus. Referral code: ${referralCode}. Thank you! Achariya Team`

        await smsService.sendAlert(user.mobileNumber, smsMessage)
        smsCount++

        // --- Email Dispatch ---
        if (user.email && !user.email.includes('N/A')) {
            const emailHtml = `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                        <div style="background: #b91c1c; color: white; padding: 24px; text-align: center;">
                            <h2 style="margin: 0;">Complete Your Profile</h2>
                        </div>
                        <div style="padding: 24px; color: #374151;">
                            <p>Dear <strong>${user.fullName}</strong>,</p>
                            <p>We noticed that your Achariya Partnership Program (APP) profile is missing campus information for your child.</p>
                            <p>To activate your referral benefits and rewards, please:</p>
                            <ol>
                                <li>Login to your account at <a href="https://5starambassador.com" style="color: #b91c1c;">5starambassador.com</a></li>
                                <li>Go to Profile Settings</li>
                                <li>Update your child's campus information</li>
                            </ol>
                            <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin-top: 24px;">
                                <p style="margin: 0; font-size: 14px;"><strong>Your Details:</strong></p>
                                <ul style="margin: 8px 0 0 0; font-size: 14px; list-style: none; padding: 0;">
                                    <li>• Mobile: ${user.mobileNumber}</li>
                                    <li>• Referral Code: ${referralCode}</li>
                                    <li>• Registration Date: ${regDate}</li>
                                </ul>
                            </div>
                            <p style="margin-top: 24px; font-size: 14px;">📞 Need help? Contact support at <strong>9363494745</strong></p>
                            <p style="margin-top: 24px; border-top: 1px solid #e5e7eb; pt: 24px;">Best regards,<br/><strong>ACHARIYA PARTNERSHIP PROGRAM TEAM</strong></p>
                        </div>
                    </div>
                `
            await EmailService.sendCampaignEmail(user.email, 'Complete Your Achariya Partnership Program Profile', emailHtml)
            emailCount++
        }

        // --- In-App Dispatch ---
        await notifyCampusUpdateRequired(user.userId, user.fullName)

        sentCount++
    }

    return { sentCount, smsCount, emailCount }
}
