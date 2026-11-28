import { getCurrentUser } from '@/lib/auth-service'
import { redirect } from 'next/navigation'
import { getMyReferrals, getMyComparisonStats, getDynamicFeeForUser } from '@/app/referral-actions'
import { getSystemSettings } from '@/app/settings-actions'
import { DashboardClient } from '@/components/dashboard/DashboardClient'
import { encryptReferralCode } from '@/lib/crypto'
import { calculateTotalBenefit } from '@/lib/benefit-calculator'
import { getStaffBaseFee } from '@/app/fee-actions'
import { getBenefitSlabs } from '@/app/benefit-actions'
import prisma from '@/lib/prisma'
import { Metadata } from 'next'

export const metadata: Metadata = {
    title: "Achariya Partnership Program (APP) | 25th Year Celebration",
    description: "Join the Achariya Partnership Program (APP). Refer students, earn rewards, and be part of our 25th Year Celebration journey."
}

export default async function DashboardPage() {
    const user = await getCurrentUser()
    if (!user) redirect('/')

    // Admin redirects
    if (user.role === 'Super Admin') redirect('/superadmin')
    if (user.role === 'Finance Admin') redirect('/finance')
    if (user.role.includes('Campus')) redirect('/campus')
    if (user.role.includes('Admin')) redirect('/admin')

    const userData = user as any
    const [
        referrals,
        dynamicStudentFee,
        slabsResult,
        activeYears,
        settlements,
        systemSettings,
        monthStats,
        notificationsResult,
        programsResult
    ] = await Promise.all([
        getMyReferrals(),
        getDynamicFeeForUser(),
        getBenefitSlabs(),
        prisma.academicYear.findMany({ where: { isActive: true } }),
        prisma.settlement.findMany({
            where: { userId: userData.userId },
            include: { referralLead: true }
        }),
        getSystemSettings(),
        getMyComparisonStats(),
        import('@/app/notification-actions').then(m => m.getNotifications(1, 10)),
        import('@/app/program-actions').then(m => m.getActivePrograms())
    ])

    const currentYearRecord = activeYears.find(y => y.isCurrent) || activeYears[0]
    const previousYearRecord = currentYearRecord
        ? activeYears
            .filter(y => y.endDate < currentYearRecord.startDate)
            .sort((a, b) => b.endDate.getTime() - a.endDate.getTime())[0]
        : undefined

    const activeYearStrings = activeYears.map(y => y.year)
    const CURRENT_ACADEMIC_YEAR = currentYearRecord?.year || '2025-2026'
    const PREVIOUS_ACADEMIC_YEAR = previousYearRecord?.year || '2024-2025'

    // Fetch Grade-1 Fees for Cash Benefit Calculations (Dashboard needs this too)
    const campusIds = Array.from(new Set(referrals.map((r: any) => r.campusId).filter(Boolean))) as number[]
    const grade1Fees = campusIds.length > 0 && activeYearStrings.length > 0
        ? await prisma.gradeFee.findMany({
            where: {
                campusId: { in: campusIds },
                grade: { in: ['Grade 1', 'Grade - 1', '1', 'I'] },
                academicYear: { in: activeYearStrings }
            }
        })
        : []
    const campusFeeMap: Record<string, Record<number, { otp: number, wotp: number }>> = {}

    // Initialize years in map
    activeYearStrings.forEach(y => { campusFeeMap[y] = {} })

    grade1Fees.forEach(gf => {
        if (!campusFeeMap[gf.academicYear]) campusFeeMap[gf.academicYear] = {}
        campusFeeMap[gf.academicYear][gf.campusId] = {
            otp: gf.annualFee_otp || 0,
            wotp: gf.annualFee_wotp || 0
        }
    })

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://5starambassador.com'

    // Encrypt referral code for security
    const encryptedCode = encryptReferralCode(userData.referralCode)

    // Short URL format - cleaner and more secure
    const referralLink = `${baseUrl}/r/${encryptedCode}`

    // Use dynamic template from settings if available
    const rawTemplate = user.role === 'Staff' ? systemSettings.staffReferralText :
        user.role === 'Alumni' ? systemSettings.alumniReferralText :
            systemSettings.parentReferralText

    let shareText = ""
    if (rawTemplate) {
        shareText = rawTemplate
            .replace(/{referralLink}/g, referralLink)
            .replace(/{academicYear}/g, CURRENT_ACADEMIC_YEAR)
    } else {
        shareText = `Hi! I'm happy to share that I've joined the Achariya Partnership Program (APP). We're celebrating our 25th Year! 🎉\n\nIf you're looking for quality education and exclusive benefits, check out our admissions portal here:\n${referralLink}\n\nJoin our community today!`
    }

    // Build WhatsApp URL
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`

    // Serialize Campus Fee Map
    const campusFeeMapObj: Record<string, Record<number, { otp: number, wotp: number }>> = {}
    Object.keys(campusFeeMap).forEach(k => {
        campusFeeMapObj[k] = campusFeeMap[k]
    })

    // Prepare User Object for Client
    const currentAccountStatus = userData.status || 'Pending'

    const userForClient: any = {
        fullName: userData.fullName,
        role: userData.role,
        referralCode: userData.referralCode,
        encryptedCode: encryptedCode,
        childInAchariya: userData.childInAchariya,
        studentFee: userData.studentFee,
        isFiveStarMember: userData.isFiveStarMember,
        benefitStatus: userData.benefitStatus,
        status: currentAccountStatus,
        empId: userData.empId,
        assignedCampus: userData.assignedCampus,
        accountNumber: userData.accountNumber,
        ifscCode: userData.ifscCode,
        paymentAmount: userData.paymentAmount,
        confirmedReferralCount: userData.confirmedReferralCount
    }

    // Sanitize Referrals (Date -> String) to avoid serialization issues
    const serializedReferrals = referrals.map((r: any) => ({
        ...r,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
        confirmedDate: r.confirmedDate ? new Date(r.confirmedDate).toISOString() : null,
        student: r.student ? {
            ...r.student,
            createdAt: r.student.createdAt ? new Date(r.student.createdAt).toISOString() : null
        } : null
    }))

    // Sanitize Active Years (Date -> String)
    const serializedActiveYears = activeYears.map((y: any) => ({
        ...y,
        startDate: y.startDate ? new Date(y.startDate).toISOString() : null,
        endDate: y.endDate ? new Date(y.endDate).toISOString() : null,
        createdAt: y.createdAt ? new Date(y.createdAt).toISOString() : null,
        updatedAt: y.updatedAt ? new Date(y.updatedAt).toISOString() : null
    }))

    // Sanitize Settlements (Date -> String)
    const serializedSettlements = settlements.map((s: any) => ({
        ...s,
        createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : null,
        payoutDate: s.payoutDate ? new Date(s.payoutDate).toISOString() : null,
        updatedAt: s.updatedAt ? new Date(s.updatedAt).toISOString() : null,
        referralLead: s.referralLead ? {
            ...s.referralLead,
            createdAt: s.referralLead.createdAt ? new Date(s.referralLead.createdAt).toISOString() : null,
            confirmedDate: s.referralLead.confirmedDate ? new Date(s.referralLead.confirmedDate).toISOString() : null
        } : null
    }))

    const { notifications, unreadCount } = notificationsResult
    const { programs } = programsResult

    return (
        <DashboardClient
            user={userForClient}
            referrals={serializedReferrals}
            activeYears={serializedActiveYears}
            settlements={serializedSettlements}
            campusFeeMap={campusFeeMap as any}
            slabs={slabsResult.data || []}
            dynamicStudentFee={dynamicStudentFee || 0}
            monthStats={monthStats}
            whatsappUrl={whatsappUrl}
            notifications={notifications || []}
            unreadCount={unreadCount || 0}
            programs={programs || []}
            currentYear={CURRENT_ACADEMIC_YEAR}
            prevYear={PREVIOUS_ACADEMIC_YEAR}
        />
    )
}
