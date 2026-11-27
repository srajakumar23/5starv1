'use client'

import { Users, UserPlus, CheckCircle, TrendingUp, Wallet, BookOpen, Target, Clock } from 'lucide-react'
import { CleanStatCard } from './CleanStatCard'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'

interface StatsCardsProps {
    analytics: {
        totalAmbassadors: number
        totalLeads: number
        totalConfirmed: number
        globalConversionRate: number
        systemWideBenefits: number
        totalStudents: number
        staffCount: number
        parentCount: number
        alumniCount: number
        othersCount: number
        prevAmbassadors?: number
        prevLeads?: number
        prevConfirmed?: number
        prevBenefits?: number
        avgLeadsPerAmbassador: number
        totalEstimatedRevenue: number
    }
    growthTrend?: { date: string; users: number }[]
    selectedCampus?: string
}

export function StatsCards({ analytics, growthTrend, selectedCampus = 'all' }: StatsCardsProps) {
    const calculateChange = (current: number, previous?: number) => {
        if (previous === undefined || previous === 0) return undefined
        const change = ((current - previous) / previous) * 100
        return {
            value: Math.abs(change),
            isIncrease: change >= 0
        }
    }

    const campusParam = selectedCampus && selectedCampus !== 'all'
        ? `campus=${encodeURIComponent(selectedCampus)}`
        : ''

    const withParams = (base: string, extra?: string) => {
        const parts = [campusParam, extra].filter(Boolean)
        return parts.length > 0 ? `${base}?${parts.join('&')}` : base
    }

    const openLeads = Math.max(0, (analytics.totalLeads || 0) - (analytics.totalConfirmed || 0))

    const sparklineChart = growthTrend && growthTrend.length > 1 ? (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={growthTrend}>
                <defs>
                    <linearGradient id="sparkUsersGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#dc2626" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <Area type="monotone" dataKey="users" stroke="#dc2626" fillOpacity={1} fill="url(#sparkUsersGrad)" strokeWidth={2} isAnimationActive={false} />
            </AreaChart>
        </ResponsiveContainer>
    ) : undefined

    const primaryStats = [
        {
            label: 'Total Ambassadors',
            value: (analytics.totalAmbassadors || 0).toLocaleString('en-IN'),
            sub: (
                <div className="flex flex-wrap gap-1.5 leading-relaxed">
                    <span className="whitespace-nowrap">{analytics.staffCount} Staff</span>
                    <span className="text-gray-300">•</span>
                    <span className="whitespace-nowrap">{analytics.parentCount} Parent</span>
                    <span className="text-gray-300">•</span>
                    <span className="whitespace-nowrap">{analytics.alumniCount} Alumni</span>
                    <span className="text-gray-300">•</span>
                    <span className="whitespace-nowrap">{analytics.othersCount} Other</span>
                </div>
            ),
            icon: Users,
            iconColor: 'bg-red-50 text-red-600',
            change: calculateChange(analytics.totalAmbassadors, analytics.prevAmbassadors),
            href: withParams('/superadmin/users'),
            sparkline: sparklineChart
        },
        {
            label: 'Total Leads',
            value: (analytics.totalLeads || 0).toLocaleString('en-IN'),
            sub: selectedCampus !== 'all' ? `${selectedCampus} CRM Pipeline` : 'Network CRM Pipeline',
            icon: UserPlus,
            iconColor: 'bg-blue-50 text-blue-600',
            change: calculateChange(analytics.totalLeads, analytics.prevLeads),
            href: withParams('/superadmin/referrals')
        },
        {
            label: 'Confirmed Admissions',
            value: (analytics.totalConfirmed || 0).toLocaleString('en-IN'),
            sub: `${analytics.globalConversionRate}% Conversion Rate`,
            icon: CheckCircle,
            iconColor: 'bg-emerald-50 text-emerald-600',
            change: calculateChange(analytics.totalConfirmed, analytics.prevConfirmed),
            href: withParams('/superadmin/referrals', 'status=Confirmed')
        },
        {
            label: 'System Wide Benefits',
            value: `₹${((analytics.systemWideBenefits || 0) / 100000).toFixed(1)}L`,
            sub: `₹${Math.round(analytics.systemWideBenefits || 0).toLocaleString('en-IN')} accrued savings`,
            icon: Wallet,
            iconColor: 'bg-amber-50 text-amber-600',
            change: calculateChange(analytics.systemWideBenefits, analytics.prevBenefits),
            href: '/finance'
        }
    ]

    const secondaryStats = [
        {
            label: 'Active Students',
            value: (analytics.totalStudents || 0).toLocaleString('en-IN'),
            sub: 'Synced in student portal',
            icon: BookOpen,
            iconColor: 'bg-violet-50 text-violet-600',
            href: '/superadmin/students'
        },
        {
            label: 'Conversion Rate',
            value: `${analytics.globalConversionRate}%`,
            sub: 'Leads to Confirmed',
            icon: TrendingUp,
            iconColor: 'bg-pink-50 text-pink-600',
            href: withParams('/superadmin/referrals')
        },
        {
            label: 'Avg. Lead Rate',
            value: analytics.avgLeadsPerAmbassador,
            sub: 'Leads / Active Ambassador',
            icon: Target,
            iconColor: 'bg-indigo-50 text-indigo-600',
            href: withParams('/superadmin/users')
        },
        {
            label: 'Open Pipeline',
            value: openLeads.toLocaleString('en-IN'),
            sub: 'Leads awaiting admission',
            icon: Clock,
            iconColor: 'bg-orange-50 text-orange-600',
            href: withParams('/superadmin/referrals')
        }
    ]

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                {primaryStats.map((stat) => (
                    <CleanStatCard
                        key={stat.label}
                        title={stat.label}
                        value={stat.value}
                        icon={stat.icon}
                        iconColor={stat.iconColor}
                        change={stat.change}
                        subtext={stat.sub}
                        href={stat.href}
                        sparkline={stat.sparkline}
                    />
                ))}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {secondaryStats.map((stat) => (
                    <CleanStatCard
                        key={stat.label}
                        title={stat.label}
                        value={stat.value}
                        icon={stat.icon}
                        iconColor={stat.iconColor}
                        subtext={stat.sub}
                        href={stat.href}
                        compact={true}
                    />
                ))}
            </div>
        </div>
    )
}
