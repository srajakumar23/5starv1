'use server'

import prisma, { withRetry } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-service'
import { hasPermission, getPermissionScope } from '@/lib/permission-service'
import { Prisma } from '@prisma/client'

export interface ExecutiveInsightsData {
    funnel: {
        totalUsers: number
        activeUsers: number
        pendingUsers: number
        referringActive: number
        convertedActive: number
        fiveStarActive: number
        dormantActive: number
    }
    leadStages: Array<{ status: string; count: number }>
    staleByCampus: Array<{
        campus: string
        openLeads: number
        stale7d: number
        stale14d: number
    }>
    gradeYield: Array<{
        grade: string
        totalLeads: number
        confirmed: number
        conversionRate: number
    }>
    roleYield: Array<{
        role: string
        totalLeads: number
        confirmed: number
        uniqueAmbassadors: number
        conversionRate: number
        leadsPerAmbassador: number
    }>
    feeMix: {
        otpCount: number
        wotpCount: number
        avgDaysToConfirm: number
    }
    velocity: {
        leads7d: number
        leadsPrev7d: number
        confirmed7d: number
        confirmedPrev7d: number
    }
    benchmark?: {
        networkConversionRate: number
        campusConversionRate: number
        campusRank?: number
        totalCampuses?: number
    }
    topAmbassadors?: Array<{
        userId: number
        fullName: string
        role: string
        referralCode: string | null
        totalLeads: number
        confirmed: number
    }>
}

export interface ExecutiveInsightsResponse {
    success: boolean
    error?: string
    data?: ExecutiveInsightsData
    scope?: {
        campus: string
        academicYear: string
    }
}

export async function getExecutiveInsights(options?: {
    campus?: string
    academicYear?: string
    startDate?: string
    endDate?: string
}): Promise<ExecutiveInsightsResponse> {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return { success: false, error: 'Unauthorized' }
        }

        const isCampusRole = user.role.includes('Campus')
        const isAllowedRole =
            user.role === 'Super Admin' ||
            user.role.includes('Admin') ||
            isCampusRole ||
            (await hasPermission('analytics'))

        if (!isAllowedRole) {
            return { success: false, error: 'Forbidden' }
        }

        let effectiveCampus: string | undefined
        const analyticsScope = user.role === 'Super Admin' ? 'all' : await getPermissionScope('analytics')
        if (isCampusRole || analyticsScope === 'campus') {
            effectiveCampus = (user as any).assignedCampus || '__NONE__'
        } else if (options?.campus && options.campus !== 'all') {
            effectiveCampus = options.campus
        }

        const campusList = effectiveCampus
            ? effectiveCampus.trim().toUpperCase() === 'ABSM - MUTHIYALPET' ||
              effectiveCampus.trim().toUpperCase() === 'ABSM -SVP'
                ? ['ABSM -SVP', 'ABSM - MUTHIYALPET']
                : [effectiveCampus]
            : []

        const academicYear =
            options?.academicYear && options.academicYear !== 'All' && options.academicYear !== 'All Time'
                ? options.academicYear
                : undefined

        const startDate = options?.startDate ? new Date(`${options.startDate}T00:00:00.000Z`) : undefined
        const endDate = options?.endDate ? new Date(`${options.endDate}T23:59:59.999Z`) : undefined

        const leadCampusSql =
            campusList.length > 0
                ? Prisma.sql`AND r."campus" IN (${Prisma.join(campusList)})`
                : Prisma.empty

        const userCampusSql =
            campusList.length > 0
                ? Prisma.sql`AND u."assignedCampus" IN (${Prisma.join(campusList)})`
                : Prisma.empty

        const leadYearSql = academicYear
            ? Prisma.sql`AND r."admittedYear" = ${academicYear}`
            : Prisma.empty

        const userYearSql = academicYear
            ? Prisma.sql`AND (u."academicYear" = ${academicYear} OR EXISTS (SELECT 1 FROM "ReferralLead" rl WHERE rl."userId" = u."userId" AND rl."admittedYear" = ${academicYear}))`
            : Prisma.empty

        const leadStartSql =
            startDate && !isNaN(startDate.getTime())
                ? Prisma.sql`AND r."createdAt" >= ${startDate}`
                : Prisma.empty

        const leadEndSql =
            endDate && !isNaN(endDate.getTime())
                ? Prisma.sql`AND r."createdAt" <= ${endDate}`
                : Prisma.empty

        const [
            funnelRows,
            leadStatusRows,
            staleRows,
            gradeRows,
            roleRows,
            feeMixRows,
            velocityRows,
            networkConvRows,
            topAmbassadorRows
        ] = await withRetry(() =>
            Promise.all([
                prisma.$queryRaw<Array<Record<string, number>>>`
                    SELECT
                        COUNT(*)::int as total_users,
                        COUNT(*) FILTER (WHERE u."status"::text = 'Active')::int as active_users,
                        COUNT(*) FILTER (WHERE u."status"::text = 'Pending')::int as pending_users,
                        COUNT(*) FILTER (
                            WHERE u."status"::text = 'Active'
                              AND u."referralCode" IS NOT NULL
                              AND EXISTS (SELECT 1 FROM "ReferralLead" r WHERE r."userId" = u."userId" ${leadYearSql} ${leadStartSql} ${leadEndSql})
                        )::int as referring_active,
                        COUNT(*) FILTER (
                            WHERE u."status"::text = 'Active'
                              AND u."confirmedReferralCount" > 0
                        )::int as converted_active,
                        COUNT(*) FILTER (
                            WHERE u."status"::text = 'Active'
                              AND (u."isFiveStarMember" = true OR u."confirmedReferralCount" >= 5)
                        )::int as five_star_active,
                        COUNT(*) FILTER (
                            WHERE u."status"::text = 'Active'
                              AND u."confirmedReferralCount" = 0
                              AND NOT EXISTS (SELECT 1 FROM "ReferralLead" r WHERE r."userId" = u."userId" ${leadYearSql} ${leadStartSql} ${leadEndSql})
                        )::int as dormant_active
                    FROM "User" u
                    WHERE u."status"::text != 'Deleted'
                    ${userCampusSql}
                    ${userYearSql}
                `,
                prisma.$queryRaw<Array<{ status: string; count: number }>>`
                    SELECT r."leadStatus"::text as status, COUNT(*)::int as count
                    FROM "ReferralLead" r
                    WHERE 1=1
                    ${leadCampusSql}
                    ${leadYearSql}
                    ${leadStartSql}
                    ${leadEndSql}
                    GROUP BY r."leadStatus"
                    ORDER BY count DESC
                `,
                prisma.$queryRaw<Array<{ campus: string; open_leads: number; stale_7d: number; stale_14d: number }>>`
                    SELECT
                        COALESCE(CASE WHEN UPPER(TRIM(r."campus")) = 'ABSM - MUTHIYALPET' THEN 'ABSM -SVP' ELSE r."campus" END, 'Unassigned') as campus,
                        COUNT(*)::int as open_leads,
                        COUNT(*) FILTER (WHERE r."createdAt" < NOW() - INTERVAL '7 days')::int as stale_7d,
                        COUNT(*) FILTER (WHERE r."createdAt" < NOW() - INTERVAL '14 days')::int as stale_14d
                    FROM "ReferralLead" r
                    WHERE r."leadStatus"::text NOT IN ('Confirmed', 'Admitted', 'Closed', 'Rejected')
                    ${leadCampusSql}
                    ${leadYearSql}
                    ${leadStartSql}
                    ${leadEndSql}
                    GROUP BY 1
                    ORDER BY stale_7d DESC, open_leads DESC
                    LIMIT 10
                `,
                prisma.$queryRaw<Array<{ grade: string; total_leads: number; confirmed: number }>>`
                    SELECT
                        COALESCE(NULLIF(TRIM(r."gradeInterested"), ''), 'Unspecified') as grade,
                        COUNT(*)::int as total_leads,
                        COUNT(*) FILTER (WHERE r."leadStatus"::text IN ('Confirmed', 'Admitted'))::int as confirmed
                    FROM "ReferralLead" r
                    WHERE 1=1
                    ${leadCampusSql}
                    ${leadYearSql}
                    ${leadStartSql}
                    ${leadEndSql}
                    GROUP BY 1
                    ORDER BY total_leads DESC
                    LIMIT 10
                `,
                prisma.$queryRaw<Array<{ role: string; total_leads: number; confirmed: number; unique_ambassadors: number }>>`
                    SELECT
                        u."role"::text as role,
                        COUNT(r."leadId")::int as total_leads,
                        COUNT(r."leadId") FILTER (WHERE r."leadStatus"::text IN ('Confirmed', 'Admitted'))::int as confirmed,
                        COUNT(DISTINCT r."userId")::int as unique_ambassadors
                    FROM "ReferralLead" r
                    JOIN "User" u ON u."userId" = r."userId"
                    WHERE 1=1
                    ${leadCampusSql}
                    ${leadYearSql}
                    ${leadStartSql}
                    ${leadEndSql}
                    GROUP BY u."role"
                    ORDER BY total_leads DESC
                `,
                prisma.$queryRaw<Array<{ otp_count: number; wotp_count: number; avg_days_to_confirm: number }>>`
                    SELECT
                        COUNT(*) FILTER (WHERE r."selectedFeeType"::text = 'OTP')::int as otp_count,
                        COUNT(*) FILTER (WHERE r."selectedFeeType"::text = 'WOTP')::int as wotp_count,
                        COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (r."confirmedDate" - r."createdAt")) / 86400.0) FILTER (WHERE r."confirmedDate" IS NOT NULL AND r."confirmedDate" >= r."createdAt")::numeric, 1)::float, 0) as avg_days_to_confirm
                    FROM "ReferralLead" r
                    WHERE r."leadStatus"::text IN ('Confirmed', 'Admitted')
                    ${leadCampusSql}
                    ${leadYearSql}
                    ${leadStartSql}
                    ${leadEndSql}
                `,
                prisma.$queryRaw<Array<{ leads_7d: number; leads_prev_7d: number; confirmed_7d: number; confirmed_prev_7d: number }>>`
                    SELECT
                        COUNT(*) FILTER (WHERE r."createdAt" >= NOW() - INTERVAL '7 days')::int as leads_7d,
                        COUNT(*) FILTER (WHERE r."createdAt" >= NOW() - INTERVAL '14 days' AND r."createdAt" < NOW() - INTERVAL '7 days')::int as leads_prev_7d,
                        COUNT(*) FILTER (WHERE r."leadStatus"::text IN ('Confirmed', 'Admitted') AND COALESCE(r."confirmedDate", r."createdAt") >= NOW() - INTERVAL '7 days')::int as confirmed_7d,
                        COUNT(*) FILTER (WHERE r."leadStatus"::text IN ('Confirmed', 'Admitted') AND COALESCE(r."confirmedDate", r."createdAt") >= NOW() - INTERVAL '14 days' AND COALESCE(r."confirmedDate", r."createdAt") < NOW() - INTERVAL '7 days')::int as confirmed_prev_7d
                    FROM "ReferralLead" r
                    WHERE 1=1
                    ${leadCampusSql}
                    ${leadYearSql}
                `,
                campusList.length > 0
                    ? prisma.$queryRaw<Array<{ total_leads: number; confirmed: number }>>`
                        SELECT
                            COUNT(*)::int as total_leads,
                            COUNT(*) FILTER (WHERE r."leadStatus"::text IN ('Confirmed', 'Admitted'))::int as confirmed
                        FROM "ReferralLead" r
                        WHERE 1=1
                        ${leadYearSql}
                        ${leadStartSql}
                        ${leadEndSql}
                    `
                    : Promise.resolve([]),
                prisma.$queryRaw<Array<{
                    user_id: number
                    full_name: string
                    role: string
                    referral_code: string | null
                    total_leads: number
                    confirmed: number
                }>>`
                    SELECT
                        u."userId"::int as user_id,
                        u."fullName" as full_name,
                        u."role"::text as role,
                        u."referralCode" as referral_code,
                        COUNT(r."leadId")::int as total_leads,
                        COUNT(r."leadId") FILTER (WHERE r."leadStatus"::text IN ('Confirmed', 'Admitted'))::int as confirmed
                    FROM "ReferralLead" r
                    JOIN "User" u ON u."userId" = r."userId"
                    WHERE 1=1
                    ${leadCampusSql}
                    ${leadYearSql}
                    ${leadStartSql}
                    ${leadEndSql}
                    GROUP BY u."userId", u."fullName", u."role", u."referralCode"
                    ORDER BY confirmed DESC, total_leads DESC
                    LIMIT 5
                `
            ])
        )

        const f = funnelRows[0] || {}
        const fm = feeMixRows[0] || { otp_count: 0, wotp_count: 0, avg_days_to_confirm: 0 }
        const vel = velocityRows[0] || { leads_7d: 0, leads_prev_7d: 0, confirmed_7d: 0, confirmed_prev_7d: 0 }

        let benchmark: ExecutiveInsightsData['benchmark']
        if (campusList.length > 0 && networkConvRows[0]) {
            const netTotal = networkConvRows[0].total_leads || 0
            const netConf = networkConvRows[0].confirmed || 0
            const campTotal = leadStatusRows.reduce((acc, s) => acc + s.count, 0)
            const campConf = leadStatusRows
                .filter(s => s.status === 'Confirmed' || s.status === 'Admitted')
                .reduce((acc, s) => acc + s.count, 0)

            benchmark = {
                networkConversionRate: netTotal > 0 ? Number(((netConf / netTotal) * 100).toFixed(1)) : 0,
                campusConversionRate: campTotal > 0 ? Number(((campConf / campTotal) * 100).toFixed(1)) : 0
            }
        }

        const data: ExecutiveInsightsData = {
            funnel: {
                totalUsers: f.total_users || 0,
                activeUsers: f.active_users || 0,
                pendingUsers: f.pending_users || 0,
                referringActive: f.referring_active || 0,
                convertedActive: f.converted_active || 0,
                fiveStarActive: f.five_star_active || 0,
                dormantActive: f.dormant_active || 0
            },
            leadStages: leadStatusRows.map(s => ({ status: s.status, count: s.count })),
            staleByCampus: staleRows.map(s => ({
                campus: s.campus,
                openLeads: s.open_leads,
                stale7d: s.stale_7d,
                stale14d: s.stale_14d
            })),
            gradeYield: gradeRows.map(g => ({
                grade: g.grade,
                totalLeads: g.total_leads,
                confirmed: g.confirmed,
                conversionRate: g.total_leads > 0 ? Number(((g.confirmed / g.total_leads) * 100).toFixed(1)) : 0
            })),
            roleYield: roleRows.map(r => ({
                role: r.role,
                totalLeads: r.total_leads,
                confirmed: r.confirmed,
                uniqueAmbassadors: r.unique_ambassadors,
                conversionRate: r.total_leads > 0 ? Number(((r.confirmed / r.total_leads) * 100).toFixed(1)) : 0,
                leadsPerAmbassador: r.unique_ambassadors > 0 ? Number((r.total_leads / r.unique_ambassadors).toFixed(2)) : 0
            })),
            feeMix: {
                otpCount: fm.otp_count || 0,
                wotpCount: fm.wotp_count || 0,
                avgDaysToConfirm: fm.avg_days_to_confirm || 0
            },
            velocity: {
                leads7d: vel.leads_7d || 0,
                leadsPrev7d: vel.leads_prev_7d || 0,
                confirmed7d: vel.confirmed_7d || 0,
                confirmedPrev7d: vel.confirmed_prev_7d || 0
            },
            benchmark,
            topAmbassadors: topAmbassadorRows.map(a => ({
                userId: a.user_id,
                fullName: a.full_name,
                role: a.role,
                referralCode: a.referral_code,
                totalLeads: a.total_leads,
                confirmed: a.confirmed
            }))
        }

        return {
            success: true,
            data,
            scope: {
                campus: effectiveCampus || 'Global Network',
                academicYear: academicYear || 'All'
            }
        }
    } catch (error: any) {
        console.error('Error in getExecutiveInsights:', error)
        return { success: false, error: error?.message || 'Failed to load insights' }
    }
}
