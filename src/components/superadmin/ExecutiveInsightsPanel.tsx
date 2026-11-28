'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
    Activity,
    AlertTriangle,
    ArrowUpRight,
    ArrowDownRight,
    Clock,
    Download,
    GraduationCap,
    IndianRupee,
    Landmark,
    Layers,
    RefreshCw,
    ShieldCheck,
    Sparkles,
    TrendingUp,
    Trophy,
    UserCheck,
    Users,
    Wallet
} from 'lucide-react'
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend
} from 'recharts'
import { getExecutiveInsights, ExecutiveInsightsData } from '@/app/actions/insights-actions'

export type InsightsTabKey = 'overview' | 'sla' | 'yield' | 'financials'

interface ExecutiveInsightsPanelProps {
    campus?: string
    academicYear?: string
    startDate?: string
    endDate?: string
    referralsBasePath?: string
    initialTab?: InsightsTabKey
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

function formatINR(val: number) {
    return `₹${Math.round(val || 0).toLocaleString('en-IN')}`
}

export function ExecutiveInsightsPanel({
    campus = 'all',
    academicYear = 'All',
    startDate,
    endDate,
    referralsBasePath = '/superadmin/referrals',
    initialTab = 'overview'
}: ExecutiveInsightsPanelProps) {
    // All hooks strictly before any conditional return (Rules of Hooks)
    const [data, setData] = useState<ExecutiveInsightsData | null>(null)
    const [scopeLabel, setScopeLabel] = useState<string>('Global Network')
    const [loading, setLoading] = useState<boolean>(true)
    const [error, setError] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<InsightsTabKey>(initialTab)

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

    const formattedDailySeries = useMemo(() => {
        if (!data?.dailySeries) return []
        return data.dailySeries.map(pt => ({
            ...pt,
            label: pt.date.slice(5) // MM-DD for compact chart axis
        }))
    }, [data?.dailySeries])

    const handleExportSnapshot = useCallback(() => {
        if (!data) return
        const lines = [
            ['Section', 'Metric', 'Value'],
            ['Scope', 'Campus', scopeLabel],
            ['Scope', 'Academic Year', academicYear],
            ['Funnel', 'Total Registered Partners', data.funnel.totalUsers],
            ['Funnel', 'Active Partners', data.funnel.activeUsers],
            ['Funnel', 'Referring Partners', data.funnel.referringActive],
            ['Funnel', 'Converted Partners', data.funnel.convertedActive],
            ['Funnel', '5-Star Champions', data.funnel.fiveStarActive],
            ['Funnel', 'Dormant Active Partners', data.funnel.dormantActive],
            ['SLA', 'Open Within 48h', data.slaHealth.within48h],
            ['SLA', 'Overdue 48h-7d', data.slaHealth.overdue48h],
            ['SLA', 'Critical >7d', data.slaHealth.overdue7d],
            ['Velocity', '7-Day New Leads', data.velocity.leads7d],
            ['Velocity', '7-Day Admissions', data.velocity.confirmed7d],
            ['Velocity', 'Avg Days to Confirm', data.feeMix.avgDaysToConfirm],
            ['Financials', 'Registration Fees Collected (INR)', data.financialHealth.registrationCollected],
            ['Financials', 'Pending Manual QR Approvals', data.financialHealth.pendingQrApprovals],
            ['Financials', 'Settled Payouts (INR)', data.financialHealth.settledAmount],
            ['Financials', 'Pending Payouts (INR)', data.financialHealth.pendingPayoutAmount],
            ['Financials', 'Partners Missing Bank Details', data.financialHealth.partnersMissingBank]
        ]

        const csv = lines
            .map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
            .join('\n')
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `executive_insights_${scopeLabel.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().slice(0, 10)}.csv`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
    }, [data, scopeLabel, academicYear])

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

    const { funnel, leadStages, staleByCampus, gradeYield, roleYield, feeMix, velocity, benchmark, topAmbassadors, slaHealth, financialHealth } = data
    const leadsMomentum = getMomentumDelta(velocity.leads7d, velocity.leadsPrev7d)
    const confMomentum = getMomentumDelta(velocity.confirmed7d, velocity.confirmedPrev7d)
    const dormantPct = funnel.activeUsers > 0 ? Math.round((funnel.dormantActive / funnel.activeUsers) * 100) : 0
    const totalStageLeads = leadStages.reduce((sum, s) => sum + s.count, 0)
    const campusParamSep = referralsBasePath.includes('?') ? '&' : '?'
    const totalFeeSelections = feeMix.otpCount + feeMix.wotpCount
    const otpPct = totalFeeSelections > 0 ? Math.round((feeMix.otpCount / totalFeeSelections) * 100) : 0
    const wotpPct = totalFeeSelections > 0 ? 100 - otpPct : 0

    const totalOverdueSla = slaHealth.overdue48h + slaHealth.overdue7d
    const totalSettlementPool = financialHealth.settledAmount + financialHealth.pendingPayoutAmount
    const settlementPct = totalSettlementPool > 0
        ? Math.min(100, Math.round((financialHealth.settledAmount / totalSettlementPool) * 100))
        : 0

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
        'Follow_up': 'bg-amber-500',
        Confirmed: 'bg-emerald-500',
        Admitted: 'bg-green-600',
        Closed: 'bg-slate-400',
        Rejected: 'bg-rose-500'
    }

    const tabs: Array<{ key: InsightsTabKey; label: string; badge?: string | number; alert?: boolean }> = [
        { key: 'overview', label: 'Velocity & Funnels' },
        {
            key: 'sla',
            label: 'SLA & Bottlenecks',
            badge: totalOverdueSla > 0 ? totalOverdueSla : undefined,
            alert: totalOverdueSla > 0
        },
        { key: 'yield', label: 'Grade, Role & Fee Yield' },
        {
            key: 'financials',
            label: 'Top Performers & Financials',
            badge: financialHealth.pendingQrApprovals > 0 ? financialHealth.pendingQrApprovals : undefined
        }
    ]

    return (
        <section className="bg-white rounded-[32px] border border-gray-100 p-6 md:p-8 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.04)] space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-5">
                <div>
                    <div className="flex items-center gap-2.5">
                        <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                            <Sparkles size={18} />
                        </span>
                        <h3 className="text-xl font-black text-gray-900 tracking-tight">
                            360° Executive Intelligence Hub
                        </h3>
                    </div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1.5">
                        Scope: {scopeLabel} &bull; Year: {academicYear}
                        {startDate || endDate ? ` • Range: ${startDate || 'Start'} → ${endDate || 'Today'}` : ''}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    {benchmark && (
                        <div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700">
                            Win Rate: <span className="text-indigo-600 font-black">{benchmark.campusConversionRate}%</span>
                            <span className="text-slate-400 mx-1.5">vs</span>
                            Network <span className="font-black">{benchmark.networkConversionRate}%</span>
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={handleExportSnapshot}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-black text-slate-700 uppercase tracking-wider transition-colors"
                    >
                        <Download size={13} />
                        Export Snapshot
                    </button>
                    <button
                        type="button"
                        onClick={() => loadInsights()}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-black text-slate-700 uppercase tracking-wider transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Always-Visible 4-Card Momentum & Health Strip */}
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
                    <p className="text-xs font-bold text-gray-500 mt-1.5">Lead submission &rarr; Admission</p>
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

            {/* 4-Tab Hub Switcher */}
            <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-100/80 rounded-2xl border border-slate-200/70 w-fit">
                {tabs.map(t => (
                    <button
                        key={t.key}
                        type="button"
                        onClick={() => setActiveTab(t.key)}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                            activeTab === t.key
                                ? 'bg-gray-900 text-white shadow-sm'
                                : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
                        }`}
                    >
                        <span>{t.label}</span>
                        {t.badge !== undefined && (
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                                activeTab === t.key
                                    ? 'bg-white/20 text-white'
                                    : t.alert
                                        ? 'bg-rose-100 text-rose-700'
                                        : 'bg-amber-100 text-amber-800'
                            }`}>
                                {t.badge}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* TAB 1: VELOCITY & FUNNELS */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    {/* Dual-Series Daily Velocity Chart */}
                    <div className="p-6 rounded-2xl bg-slate-50/60 border border-slate-200/70 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                                <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                    <TrendingUp size={16} className="text-indigo-600" />
                                    Daily Lead &amp; Admission Velocity
                                </h4>
                                <p className="text-xs font-semibold text-gray-500 mt-0.5">
                                    Inbound referral volume vs confirmed admissions over {startDate || endDate ? 'selected window' : 'last 30 days'}
                                </p>
                            </div>
                        </div>

                        {formattedDailySeries.length === 0 ? (
                            <div className="h-48 flex items-center justify-center text-xs font-bold text-gray-400">
                                No lead velocity points in the selected window.
                            </div>
                        ) : (
                            <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={formattedDailySeries} margin={{ top: 10, right: 16, left: -12, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="insLeadsGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.25} />
                                                <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="insConfGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                                        <Tooltip
                                            contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 700 }}
                                        />
                                        <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 700 }} />
                                        <Area type="monotone" dataKey="leads" name="New Leads" stroke="#4f46e5" strokeWidth={2.5} fillOpacity={1} fill="url(#insLeadsGrad)" />
                                        <Area type="monotone" dataKey="confirmed" name="Confirmed Admissions" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#insConfGrad)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    {/* 2-Column Funnels */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="p-6 rounded-2xl bg-slate-50/70 border border-slate-100 space-y-4">
                            <div>
                                <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                    <Activity size={16} className="text-indigo-600" />
                                    Ambassador Activation Funnel
                                </h4>
                                <p className="text-xs font-semibold text-gray-500 mt-0.5">
                                    Pending: {funnel.pendingUsers.toLocaleString()} awaiting activation
                                </p>
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
                                                    <span className="text-gray-700">{stage.status.replace('_', '-')}</span>
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
                </div>
            )}

            {/* TAB 2: SLA & BOTTLENECKS */}
            {activeTab === 'sla' && (
                <div className="space-y-6">
                    {/* SLA Aging Radar */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="p-5 rounded-2xl bg-emerald-50/60 border border-emerald-200">
                            <div className="text-[11px] font-black uppercase tracking-wider text-emerald-700">On Track (&lt;48h)</div>
                            <div className="text-3xl font-black text-emerald-900 mt-1">{slaHealth.within48h.toLocaleString()}</div>
                            <p className="text-xs font-semibold text-emerald-700 mt-1">
                                {slaHealth.totalOpen > 0 ? Math.round((slaHealth.within48h / slaHealth.totalOpen) * 100) : 0}% of {slaHealth.totalOpen} open leads
                            </p>
                        </div>

                        <Link
                            href={referralsBasePath}
                            className="p-5 rounded-2xl bg-amber-50/70 border border-amber-200 hover:shadow-md transition-all"
                        >
                            <div className="flex items-center justify-between text-amber-700">
                                <span className="text-[11px] font-black uppercase tracking-wider">SLA Warning (48h–7d)</span>
                                <ArrowUpRight size={14} />
                            </div>
                            <div className="text-3xl font-black text-amber-900 mt-1">{slaHealth.overdue48h.toLocaleString()}</div>
                            <p className="text-xs font-semibold text-amber-800 mt-1">Open leads needing follow-up</p>
                        </Link>

                        <Link
                            href={referralsBasePath}
                            className="p-5 rounded-2xl bg-rose-50/70 border border-rose-200 hover:shadow-md transition-all"
                        >
                            <div className="flex items-center justify-between text-rose-700">
                                <span className="text-[11px] font-black uppercase tracking-wider">Critical Stale (&gt;7d)</span>
                                <ArrowUpRight size={14} />
                            </div>
                            <div className="text-3xl font-black text-rose-900 mt-1">{slaHealth.overdue7d.toLocaleString()}</div>
                            <p className="text-xs font-semibold text-rose-800 mt-1">High-risk leads &gt;7 days open</p>
                        </Link>
                    </div>

                    {/* Stale Open Leads by Campus */}
                    <div className="p-6 rounded-2xl bg-white border border-slate-200/80 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                    <AlertTriangle size={16} className="text-amber-500" />
                                    Stale Lead Bottlenecks by Campus
                                </h4>
                                <p className="text-xs font-semibold text-gray-500 mt-0.5">
                                    Click any campus to jump directly into its filtered Referral Pipeline
                                </p>
                            </div>
                        </div>

                        {staleByCampus.length === 0 ? (
                            <p className="text-xs font-bold text-emerald-600 py-8 text-center">
                                Zero stale open leads in this scope!
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
                </div>
            )}

            {/* TAB 3: GRADE, ROLE & FEE YIELD */}
            {activeTab === 'yield' && (
                <div className="space-y-6">
                    <div className="p-6 rounded-2xl bg-white border border-slate-200/80 space-y-5">
                        <div>
                            <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                <Wallet size={16} className="text-emerald-600" />
                                Partner Role Yield &amp; Fee Plan Mix
                            </h4>
                            <p className="text-xs font-semibold text-gray-500 mt-0.5">
                                Productivity by partner category and confirmed fee plan split
                            </p>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b border-slate-100 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                        <th className="py-2 pr-3">Role</th>
                                        <th className="py-2 px-2 text-right">Partners</th>
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
                                            <td className="py-2.5 px-2 text-right font-bold text-gray-500">{r.uniqueAmbassadors}</td>
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
                                    OTP: <strong className="text-emerald-700">{feeMix.otpCount} ({otpPct}%)</strong> &bull; WOTP:{' '}
                                    <strong className="text-indigo-700">{feeMix.wotpCount} ({wotpPct}%)</strong>
                                </span>
                            </div>
                            <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden flex">
                                <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${otpPct}%` }} />
                                <div className="bg-indigo-500 h-full transition-all duration-500" style={{ width: `${wotpPct}%` }} />
                            </div>
                        </div>
                    </div>

                    <div className="p-6 rounded-2xl bg-slate-50/70 border border-slate-100 space-y-4">
                        <div>
                            <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                <GraduationCap size={16} className="text-violet-600" />
                                Top 10 High-Demand Grades &amp; Win Rates
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
                </div>
            )}

            {/* TAB 4: TOP PERFORMERS & FINANCIAL HEALTH */}
            {activeTab === 'financials' && (
                <div className="space-y-6">
                    {/* Scoped Financial & Bank Readiness Pulse */}
                    <div className="p-6 rounded-2xl bg-slate-50/70 border border-slate-200/70 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                                <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                    <ShieldCheck size={16} className="text-emerald-600" />
                                    Scoped Financial &amp; Bank Readiness Pulse
                                </h4>
                                <p className="text-xs font-semibold text-gray-500 mt-0.5">
                                    Live read-only snapshot for {scopeLabel}
                                </p>
                            </div>
                            <span className="text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                                Settlement Completion: {settlementPct}%
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                            <div className="p-4 rounded-xl bg-white border border-slate-200/80 space-y-1">
                                <div className="text-[10px] font-black uppercase tracking-wider text-gray-400 flex items-center justify-between">
                                    <span>Reg. Fees Collected</span>
                                    <IndianRupee size={13} className="text-emerald-600" />
                                </div>
                                <div className="text-lg font-black text-gray-900 tabular-nums">{formatINR(financialHealth.registrationCollected)}</div>
                                <div className="text-[11px] font-semibold text-gray-500">{financialHealth.registrationCount} paid activations</div>
                            </div>

                            <div className="p-4 rounded-xl bg-white border border-slate-200/80 space-y-1">
                                <div className="text-[10px] font-black uppercase tracking-wider text-gray-400 flex items-center justify-between">
                                    <span>Pending QR Verify</span>
                                    <Clock size={13} className="text-amber-600" />
                                </div>
                                <div className="text-lg font-black text-amber-700 tabular-nums">{financialHealth.pendingQrApprovals}</div>
                                <div className="text-[11px] font-semibold text-gray-500">{formatINR(financialHealth.pendingQrAmount)} awaiting review</div>
                            </div>

                            <div className="p-4 rounded-xl bg-white border border-slate-200/80 space-y-1">
                                <div className="text-[10px] font-black uppercase tracking-wider text-gray-400 flex items-center justify-between">
                                    <span>Disbursed Payouts</span>
                                    <Wallet size={13} className="text-emerald-600" />
                                </div>
                                <div className="text-lg font-black text-emerald-700 tabular-nums">{formatINR(financialHealth.settledAmount)}</div>
                                <div className="text-[11px] font-semibold text-gray-500">{financialHealth.settledCount} settled entries</div>
                            </div>

                            <div className="p-4 rounded-xl bg-white border border-slate-200/80 space-y-1">
                                <div className="text-[10px] font-black uppercase tracking-wider text-gray-400 flex items-center justify-between">
                                    <span>Pending Payouts</span>
                                    <Wallet size={13} className="text-indigo-600" />
                                </div>
                                <div className="text-lg font-black text-indigo-700 tabular-nums">{formatINR(financialHealth.pendingPayoutAmount)}</div>
                                <div className="text-[11px] font-semibold text-gray-500">{financialHealth.pendingPayoutCount} queued requests</div>
                            </div>

                            <div className="p-4 rounded-xl bg-white border border-slate-200/80 space-y-1">
                                <div className="text-[10px] font-black uppercase tracking-wider text-gray-400 flex items-center justify-between">
                                    <span>Missing Bank Details</span>
                                    <Landmark size={13} className="text-rose-600" />
                                </div>
                                <div className={`text-lg font-black tabular-nums ${financialHealth.partnersMissingBank > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                                    {financialHealth.partnersMissingBank}
                                </div>
                                <div className="text-[11px] font-semibold text-gray-500">Converted partners without A/C</div>
                            </div>
                        </div>
                    </div>

                    {/* Top Performing Ambassadors */}
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
                        {!topAmbassadors || topAmbassadors.length === 0 ? (
                            <p className="text-xs font-bold text-gray-400 py-4 text-center">No ambassador referrals recorded in this scope yet.</p>
                        ) : (
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
                        )}
                    </div>
                </div>
            )}
        </section>
    )
}
