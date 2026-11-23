'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
    Activity,
    AlertTriangle,
    ArrowUpRight,
    ArrowDownRight,
    Clock,
    GraduationCap,
    Layers,
    RefreshCw,
    Sparkles,
    TrendingUp,
    Trophy,
    UserCheck,
    Users,
    Wallet
} from 'lucide-react'
import { getExecutiveInsights, ExecutiveInsightsData } from '@/app/actions/insights-actions'

interface ExecutiveInsightsPanelProps {
    campus?: string
    academicYear?: string
    startDate?: string
    endDate?: string
    referralsBasePath?: string
}

function getMomentumDelta(current: number, previous: number) {
    if (previous === 0) {
        if (current === 0) return { label: '0%', positive: true, neutral: true }
        return { label: `+${current} new`, positive: true, neutral: false }
    }
    const pct = Math.round(((current - previous) / previous) * 100)
    return {
        label: `${pct >= 0 ? '+' : ''}${pct}% vs prior 7d`,
        positive: pct >= 0,
        neutral: pct === 0
    }
}

export function ExecutiveInsightsPanel({
    campus = 'all',
    academicYear = 'All',
    startDate,
    endDate,
    referralsBasePath = '/superadmin/referrals'
}: ExecutiveInsightsPanelProps) {
    const [data, setData] = useState<ExecutiveInsightsData | null>(null)
    const [scopeLabel, setScopeLabel] = useState<string>('Global Network')
    const [loading, setLoading] = useState<boolean>(true)
    const [error, setError] = useState<string | null>(null)

    const loadInsights = useCallback(
        async (isCancelled?: () => boolean) => {
            setLoading(true)
            setError(null)
            try {
                const res = await getExecutiveInsights({
                    campus,
                    academicYear,
                    startDate,
                    endDate
                })
                if (isCancelled?.()) return
                if (res.success && res.data) {
                    setData(res.data)
                    setScopeLabel(res.scope?.campus || 'Global Network')
                } else {
                    setError(res.error || 'Failed to load intelligence insights')
                }
            } catch (err: any) {
                if (isCancelled?.()) return
                setError(err?.message || 'Failed to load intelligence insights')
            } finally {
                if (!isCancelled?.()) setLoading(false)
            }
        },
        [campus, academicYear, startDate, endDate]
    )

    useEffect(() => {
        let cancelled = false
        loadInsights(() => cancelled)
        return () => {
            cancelled = true
        }
    }, [loadInsights])

    if (loading && !data) {
        return (
            <div className="bg-white rounded-[32px] border border-gray-100 p-8 shadow-sm space-y-6 animate-pulse">
                <div className="flex justify-between items-center">
                    <div className="h-7 w-72 bg-slate-200 rounded-xl" />
                    <div className="h-8 w-28 bg-slate-100 rounded-xl" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-28 bg-slate-100 rounded-2xl" />
                    ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="h-64 bg-slate-100 rounded-2xl" />
                    <div className="h-64 bg-slate-100 rounded-2xl" />
                </div>
            </div>
        )
    }

    if (error && !data) {
        return (
            <div className="bg-white rounded-[32px] border border-red-100 p-6 flex items-center justify-between">
                <div className="flex items-center gap-3 text-red-600">
                    <AlertTriangle size={20} />
                    <span className="text-sm font-bold">{error}</span>
                </div>
                <button
                    onClick={() => loadInsights()}
                    className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs font-black uppercase tracking-wider transition-colors"
                >
                    Retry
                </button>
            </div>
        )
    }

    if (!data) return null

    const { funnel, leadStages, staleByCampus, gradeYield, roleYield, feeMix, velocity, benchmark, topAmbassadors } = data
    const leadsMomentum = getMomentumDelta(velocity.leads7d, velocity.leadsPrev7d)
    const confMomentum = getMomentumDelta(velocity.confirmed7d, velocity.confirmedPrev7d)
    const dormantPct = funnel.activeUsers > 0 ? Math.round((funnel.dormantActive / funnel.activeUsers) * 100) : 0
    const totalStageLeads = leadStages.reduce((sum, s) => sum + s.count, 0)
    const campusParamSep = referralsBasePath.includes('?') ? '&' : '?'
    const totalFeeSelections = feeMix.otpCount + feeMix.wotpCount
    const otpPct = totalFeeSelections > 0 ? Math.round((feeMix.otpCount / totalFeeSelections) * 100) : 0
    const wotpPct = totalFeeSelections > 0 ? 100 - otpPct : 0

    const funnelSteps = [
        { label: 'Total Registered', value: funnel.totalUsers, color: 'bg-slate-700' },
        { label: 'Active Partners', value: funnel.activeUsers, color: 'bg-indigo-600' },
        { label: 'Referring (≥1 Lead)', value: funnel.referringActive, color: 'bg-blue-500' },
        { label: 'Converted (≥1 Admission)', value: funnel.convertedActive, color: 'bg-emerald-500' },
        { label: '5-Star Champions', value: funnel.fiveStarActive, color: 'bg-amber-500' }
    ]
    const funnelBase = Math.max(funnel.totalUsers, 1)

    const stageColorMap: Record<string, string> = {
        New: 'bg-blue-500',
        Contacted: 'bg-sky-500',
        Interested: 'bg-indigo-500',
        'Follow-up': 'bg-amber-500',
        Confirmed: 'bg-emerald-500',
        Admitted: 'bg-green-600',
        Closed: 'bg-slate-400',
        Rejected: 'bg-rose-500'
    }

    return (
        <section className="bg-white rounded-[32px] border border-gray-100 p-6 md:p-8 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.04)] space-y-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-5">
                <div>
                    <div className="flex items-center gap-2.5">
                        <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                            <Sparkles size={18} />
                        </span>
                        <h3 className="text-xl font-black text-gray-900 tracking-tight">
                            Executive Intelligence & Bottlenecks
                        </h3>
                    </div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1.5">
                        Scope: {scopeLabel} • Year: {academicYear}
                        {startDate || endDate ? ` • Range: ${startDate || 'Start'} → ${endDate || 'Today'}` : ''}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {benchmark && (
                        <div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700">
                            Win Rate: <span className="text-indigo-600 font-black">{benchmark.campusConversionRate}%</span>
                            <span className="text-slate-400 mx-1.5">vs</span>
                            Network <span className="font-black">{benchmark.networkConversionRate}%</span>
                        </div>
                    )}
                    <button
                        onClick={() => loadInsights()}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-black text-slate-700 uppercase tracking-wider transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* 4-Card Momentum & Health Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 rounded-2xl bg-gradient-to-br from-blue-50/70 to-white border border-blue-100">
                    <div className="flex items-center justify-between text-blue-600 mb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider">7-Day New Leads</span>
                        <TrendingUp size={16} />
                    </div>
                    <p className="text-3xl font-black text-gray-900">{velocity.leads7d.toLocaleString()}</p>
                    <p className={`text-xs font-bold mt-1.5 flex items-center gap-1 ${leadsMomentum.positive ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {leadsMomentum.positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                        {leadsMomentum.label}
                    </p>
                </div>

                <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-50/70 to-white border border-emerald-100">
                    <div className="flex items-center justify-between text-emerald-600 mb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider">7-Day Admissions</span>
                        <UserCheck size={16} />
                    </div>
                    <p className="text-3xl font-black text-gray-900">{velocity.confirmed7d.toLocaleString()}</p>
                    <p className={`text-xs font-bold mt-1.5 flex items-center gap-1 ${confMomentum.positive ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {confMomentum.positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                        {confMomentum.label}
                    </p>
                </div>

                <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-50/70 to-white border border-indigo-100">
                    <div className="flex items-center justify-between text-indigo-600 mb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider">Avg Cycle Time</span>
                        <Clock size={16} />
                    </div>
                    <p className="text-3xl font-black text-gray-900">{feeMix.avgDaysToConfirm}d</p>
                    <p className="text-xs font-bold text-gray-500 mt-1.5">Lead creation → Confirmation</p>
                </div>

                <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-50/80 to-white border border-amber-100">
                    <div className="flex items-center justify-between text-amber-600 mb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider">Dormant Active</span>
                        <Users size={16} />
                    </div>
                    <p className="text-3xl font-black text-gray-900">{funnel.dormantActive.toLocaleString()}</p>
                    <p className="text-xs font-bold text-amber-700 mt-1.5">
                        {dormantPct}% of Active partners have 0 leads
                    </p>
                </div>
            </div>

            {/* 2-Column Funnels Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Ambassador Activation Funnel */}
                <div className="p-6 rounded-2xl bg-slate-50/70 border border-slate-100 space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                <Activity size={16} className="text-indigo-600" />
                                Ambassador Activation Funnel
                            </h4>
                            <p className="text-xs font-semibold text-gray-500 mt-0.5">
                                Pending: {funnel.pendingUsers.toLocaleString()} awaiting activation
                            </p>
                        </div>
                    </div>

                    <div className="space-y-3 pt-1">
                        {funnelSteps.map((step) => {
                            const pct = Math.round((step.value / funnelBase) * 100)
                            return (
                                <div key={step.label} className="space-y-1">
                                    <div className="flex justify-between text-xs font-bold">
                                        <span className="text-gray-700">{step.label}</span>
                                        <span className="text-gray-900">
                                            {step.value.toLocaleString()}{' '}
                                            <span className="text-gray-400 font-semibold">({pct}%)</span>
                                        </span>
                                    </div>
                                    <div className="h-2.5 w-full bg-white rounded-full overflow-hidden border border-slate-100">
                                        <div
                                            className={`h-full ${step.color} rounded-full transition-all duration-500`}
                                            style={{ width: `${Math.max(pct, step.value > 0 ? 3 : 0)}%` }}
                                        />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Full Lead Stage Pipeline */}
                <div className="p-6 rounded-2xl bg-slate-50/70 border border-slate-100 space-y-4">
                    <div>
                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                            <Layers size={16} className="text-blue-600" />
                            Full Lead Stage Pipeline
                        </h4>
                        <p className="text-xs font-semibold text-gray-500 mt-0.5">
                            Total pipeline volume: {totalStageLeads.toLocaleString()} leads
                        </p>
                    </div>

                    {leadStages.length === 0 ? (
                        <p className="text-xs font-bold text-gray-400 py-8 text-center">No leads in current filter.</p>
                    ) : (
                        <div className="space-y-3 pt-1">
                            {leadStages.map((stage) => {
                                const share = totalStageLeads > 0 ? Math.round((stage.count / totalStageLeads) * 100) : 0
                                const barColor = stageColorMap[stage.status] || 'bg-slate-500'
                                return (
                                    <div key={stage.status} className="space-y-1">
                                        <div className="flex justify-between text-xs font-bold">
                                            <span className="text-gray-700">{stage.status}</span>
                                            <span className="text-gray-900">
                                                {stage.count.toLocaleString()}{' '}
                                                <span className="text-gray-400 font-semibold">({share}%)</span>
                                            </span>
                                        </div>
                                        <div className="h-2.5 w-full bg-white rounded-full overflow-hidden border border-slate-100">
                                            <div
                                                className={`h-full ${barColor} rounded-full transition-all duration-500`}
                                                style={{ width: `${Math.max(share, stage.count > 0 ? 3 : 0)}%` }}
                                            />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* 2-Column Bottlenecks & Yield Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Stale Open Leads by Campus */}
                <div className="p-6 rounded-2xl bg-white border border-slate-200/80 space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                <AlertTriangle size={16} className="text-amber-500" />
                                Stale Lead Bottlenecks
                            </h4>
                            <p className="text-xs font-semibold text-gray-500 mt-0.5">
                                Open leads awaiting action &gt;7 days and &gt;14 days
                            </p>
                        </div>
                    </div>

                    {staleByCampus.length === 0 ? (
                        <p className="text-xs font-bold text-emerald-600 py-8 text-center">
                            No open stale leads in this scope.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b border-slate-100 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                        <th className="py-2 pr-3">Campus</th>
                                        <th className="py-2 px-2 text-right">Open</th>
                                        <th className="py-2 px-2 text-right">&gt;7d</th>
                                        <th className="py-2 pl-2 text-right">&gt;14d</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {staleByCampus.map((row) => (
                                        <tr key={row.campus} className="hover:bg-slate-50/70 transition-colors">
                                            <td className="py-2.5 pr-3 font-bold text-gray-800">
                                                <Link
                                                    href={`${referralsBasePath}${campusParamSep}campus=${encodeURIComponent(row.campus)}`}
                                                    className="hover:text-indigo-600 hover:underline"
                                                >
                                                    {row.campus}
                                                </Link>
                                            </td>
                                            <td className="py-2.5 px-2 text-right font-bold text-gray-600">
                                                {row.openLeads}
                                            </td>
                                            <td className="py-2.5 px-2 text-right">
                                                <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-black">
                                                    {row.stale7d}
                                                </span>
                                            </td>
                                            <td className="py-2.5 pl-2 text-right">
                                                <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-black">
                                                    {row.stale14d}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Role Yield & Fee Plan Mix */}
                <div className="p-6 rounded-2xl bg-white border border-slate-200/80 space-y-5">
                    <div>
                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                            <Wallet size={16} className="text-emerald-600" />
                            Partner Role Yield & Fee Mix
                        </h4>
                        <p className="text-xs font-semibold text-gray-500 mt-0.5">
                            Productivity by partner category and confirmed fee plan
                        </p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead>
                                <tr className="border-b border-slate-100 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                    <th className="py-2 pr-3">Role</th>
                                    <th className="py-2 px-2 text-right">Leads</th>
                                    <th className="py-2 px-2 text-right">Admitted</th>
                                    <th className="py-2 px-2 text-right">Win %</th>
                                    <th className="py-2 pl-2 text-right">Leads/User</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {roleYield.map((r) => (
                                    <tr key={r.role} className="hover:bg-slate-50/70">
                                        <td className="py-2.5 pr-3 font-black text-gray-800">{r.role}</td>
                                        <td className="py-2.5 px-2 text-right font-bold text-gray-600">{r.totalLeads}</td>
                                        <td className="py-2.5 px-2 text-right font-bold text-emerald-600">{r.confirmed}</td>
                                        <td className="py-2.5 px-2 text-right font-black text-indigo-600">{r.conversionRate}%</td>
                                        <td className="py-2.5 pl-2 text-right font-bold text-gray-700">{r.leadsPerAmbassador}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="pt-3 border-t border-slate-100 space-y-2">
                        <div className="flex justify-between text-xs font-bold">
                            <span className="text-gray-700">Confirmed Fee Plan Split</span>
                            <span className="text-gray-500">
                                OTP: <strong className="text-emerald-700">{feeMix.otpCount} ({otpPct}%)</strong> • WOTP:{' '}
                                <strong className="text-indigo-700">{feeMix.wotpCount} ({wotpPct}%)</strong>
                            </span>
                        </div>
                        <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden flex">
                            <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${otpPct}%` }} />
                            <div className="bg-indigo-500 h-full transition-all duration-500" style={{ width: `${wotpPct}%` }} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Top Performing Ambassadors */}
            {topAmbassadors && topAmbassadors.length > 0 && (
                <div className="p-6 rounded-2xl bg-slate-50/70 border border-slate-100 space-y-4">
                    <div>
                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                            <Trophy size={16} className="text-amber-500" />
                            Top Performing Ambassadors (In Scope)
                        </h4>
                        <p className="text-xs font-semibold text-gray-500 mt-0.5">
                            Ranked by confirmed admissions and total referral volume
                        </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                        {topAmbassadors.map((amb, idx) => (
                            <div
                                key={amb.userId}
                                className={`p-4 rounded-xl border space-y-2 ${
                                    idx === 0
                                        ? 'bg-amber-50/60 border-amber-200'
                                        : 'bg-white border-slate-200/70'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span
                                        className={`w-6 h-6 rounded-lg text-[11px] font-black flex items-center justify-center ${
                                            idx === 0
                                                ? 'bg-amber-400 text-white'
                                                : 'bg-slate-100 text-slate-600'
                                        }`}
                                    >
                                        #{idx + 1}
                                    </span>
                                    <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                                        {amb.role}
                                    </span>
                                </div>
                                <p className="text-xs font-black text-gray-900 truncate" title={amb.fullName}>
                                    {amb.fullName}
                                </p>
                                {amb.referralCode && (
                                    <p className="text-[10px] font-bold text-indigo-600 font-mono truncate">
                                        {amb.referralCode}
                                    </p>
                                )}
                                <div className="flex justify-between text-[11px] font-bold pt-1 border-t border-slate-100">
                                    <span className="text-emerald-600">{amb.confirmed} won</span>
                                    <span className="text-gray-500">{amb.totalLeads} leads</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Top Demand Grades */}
            <div className="p-6 rounded-2xl bg-slate-50/70 border border-slate-100 space-y-4">
                <div>
                    <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                        <GraduationCap size={16} className="text-violet-600" />
                        Top 10 High-Demand Grades & Win Rates
                    </h4>
                    <p className="text-xs font-semibold text-gray-500 mt-0.5">
                        Most requested admission grades and their conversion ratio
                    </p>
                </div>

                {gradeYield.length === 0 ? (
                    <p className="text-xs font-bold text-gray-400 py-4 text-center">No grade demand data available.</p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                        {gradeYield.map((g) => (
                            <div key={g.grade} className="bg-white p-4 rounded-xl border border-slate-200/70 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-black text-gray-900 truncate" title={g.grade}>
                                        {g.grade}
                                    </span>
                                    <span className="text-[11px] font-black text-indigo-600 shrink-0">
                                        {g.conversionRate}%
                                    </span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-violet-500 rounded-full"
                                        style={{ width: `${Math.min(g.conversionRate, 100)}%` }}
                                    />
                                </div>
                                <div className="flex justify-between text-[11px] font-bold text-gray-500">
                                    <span>{g.totalLeads} leads</span>
                                    <span className="text-emerald-600">{g.confirmed} won</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    )
}
