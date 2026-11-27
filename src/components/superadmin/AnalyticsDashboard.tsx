'use client'

import Link from 'next/link'
import { useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { StatsCards } from '@/components/superadmin/StatsCards'
import { CampusPerformanceTable } from '@/components/superadmin/CampusPerformanceTable'
import { CampusBarChart, GrowthTrendChart, GenericPieChart, CampusEfficiencyChart } from '@/components/analytics/analytics-components'
import { AcademicYearFilter } from '@/components/AcademicYearFilter'
import { StudentSourceFilter } from '@/components/StudentSourceFilter'
import { SystemAnalytics, CampusPerformance } from '@/types'
import { TrendingUp, Target, Calendar, RefreshCw, X, CheckCircle2, Wallet, GitFork, LifeBuoy, ArrowUpRight } from 'lucide-react'

const RetentionHeatmap = dynamic(() => import('@/components/analytics/RetentionHeatmap').then(m => m.RetentionHeatmap), {
    ssr: false,
    loading: () => <div className="h-96 w-full animate-pulse bg-gray-100 rounded-3xl" />
})
const ExecutiveInsightsPanel = dynamic(() => import('@/components/superadmin/ExecutiveInsightsPanel').then(m => m.ExecutiveInsightsPanel), {
    ssr: false,
    loading: () => <div className="h-96 w-full animate-pulse bg-white rounded-[32px] border border-gray-100" />
})

type PeriodPreset = 'all' | 'today' | '7d' | '30d' | 'ytd' | 'custom'

function toLocalDateInput(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

interface AnalyticsDashboardProps {
    analyticsData: SystemAnalytics
    trendData: { date: string; users: number }[]
    campusCompData: CampusPerformance[]
    deepTrends?: any
    opsPulse?: {
        pendingApprovals: number
        pendingPayouts: number
        urgentTickets: number
    }
}

export function AnalyticsDashboard({ analyticsData: initialAnalytics, trendData, campusCompData, opsPulse }: AnalyticsDashboardProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const selectedYear = searchParams.get('year') || 'All'
    const [isTableExpanded, setIsTableExpanded] = useState(false)
    const [selectedCampus, setSelectedCampus] = useState<string>('all')
    const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' })
    const [activePreset, setActivePreset] = useState<PeriodPreset>('all')
    const [trendMode, setTrendMode] = useState<'daily' | 'cumulative'>('daily')
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => {
        setIsMounted(true)
    }, [])

    const applyPreset = (preset: PeriodPreset) => {
        setActivePreset(preset)
        if (preset === 'all') {
            setDateRange({ start: '', end: '' })
            return
        }
        const now = new Date()
        const end = toLocalDateInput(now)
        const startDate = new Date(now)
        if (preset === '7d') startDate.setDate(now.getDate() - 7)
        else if (preset === '30d') startDate.setDate(now.getDate() - 30)
        else if (preset === 'ytd') startDate.setMonth(0, 1)
        setDateRange({ start: toLocalDateInput(startDate), end })
    }

    const handleRefresh = () => {
        setIsRefreshing(true)
        router.refresh()
        setTimeout(() => setIsRefreshing(false), 700)
    }

    // Filter analytics by campus
    const displayedAnalytics = selectedCampus === 'all'
        ? initialAnalytics
        : (() => {
            const campusPerf = campusCompData.find(c => c.campus === selectedCampus)
            if (!campusPerf) return initialAnalytics

            const combinedAmbassadors =
                (campusPerf.staffCount || 0) +
                (campusPerf.parentCount || 0) +
                (campusPerf.alumniCount || 0) +
                (campusPerf.othersCount || 0)

            return {
                ...initialAnalytics,
                totalLeads: campusPerf.totalLeads,
                totalConfirmed: campusPerf.confirmed,
                globalConversionRate: campusPerf.conversionRate,
                totalAmbassadors: combinedAmbassadors || campusPerf.ambassadors || 0,
                userRoleDistribution: campusPerf.roleDistribution || [],
                staffCount: campusPerf.staffCount || 0,
                parentCount: campusPerf.parentCount || 0,
                alumniCount: campusPerf.alumniCount || 0,
                othersCount: campusPerf.othersCount || 0,
                totalStudents: campusPerf.totalStudents || 0,
                avgLeadsPerAmbassador: campusPerf.ambassadors > 0 ? Number((campusPerf.totalLeads / campusPerf.ambassadors).toFixed(2)) : 0,
                totalEstimatedRevenue: initialAnalytics.totalEstimatedRevenue || 0,
                systemWideBenefits: campusPerf.systemWideBenefits || 0,
                prevBenefits: campusPerf.prevBenefits || 0,
                prevAmbassadors: 0,
                prevLeads: campusPerf.prevLeads || 0,
                prevConfirmed: campusPerf.prevConfirmed || 0,
            }
        })()

    const displayedCampusData = selectedCampus === 'all'
        ? campusCompData
        : campusCompData.filter(c => c.campus === selectedCampus)

    const displayedTrendData = useMemo(() => {
        const filtered = trendData.filter((d) => {
            if (dateRange.start && d.date < dateRange.start) return false
            if (dateRange.end && d.date > dateRange.end) return false
            return true
        })
        if (trendMode === 'daily') return filtered
        let running = 0
        return filtered.map((d) => {
            running += d.users || 0
            return { ...d, cumulative: running }
        })
    }, [trendData, dateRange, trendMode])

    const handleBarCampusSelect = (campusName: string) => {
        setSelectedCampus(prev => prev === campusName ? 'all' : campusName)
    }

    const openLeadsCount = Math.max(0, (displayedAnalytics.totalLeads || 0) - (displayedAnalytics.totalConfirmed || 0))

    return (
        <div className="animate-fade-in space-y-6">
            {/* Unified Command Header */}
            <div className="bg-white p-5 xl:pr-14 rounded-[28px] border border-gray-100 shadow-sm space-y-4 relative z-20">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
                            <Target size={20} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2.5">
                                <h2 className="text-xl font-black text-gray-900 tracking-tight">
                                    {selectedCampus === 'all' ? 'Executive Command Center' : `${selectedCampus}`}
                                </h2>
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-wider border border-emerald-100">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    Live
                                </span>
                                {selectedCampus !== 'all' && (
                                    <button
                                        type="button"
                                        onClick={() => setSelectedCampus('all')}
                                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-[10px] font-black uppercase tracking-wider transition-colors"
                                    >
                                        Clear Campus <X size={11} />
                                    </button>
                                )}
                            </div>
                            <p className="text-xs font-medium text-gray-400 mt-0.5">
                                Real-time ambassador, lead pipeline &amp; campus conversion intelligence
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <StudentSourceFilter />
                        <AcademicYearFilter />
                        <select
                            aria-label="Filter by Campus"
                            className="p-2.5 border border-gray-200 rounded-xl bg-gray-50 text-xs font-black uppercase tracking-tight focus:ring-4 focus:ring-blue-50 outline-none cursor-pointer"
                            value={selectedCampus}
                            onChange={(e) => setSelectedCampus(e.target.value)}
                            suppressHydrationWarning
                        >
                            <option value="all">Global Network ({campusCompData.length})</option>
                            {campusCompData.map(c => (
                                <option key={c.campus} value={c.campus}>{c.campus}</option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={handleRefresh}
                            aria-label="Refresh dashboard"
                            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-xs font-bold text-gray-700 transition-all shadow-sm active:scale-95"
                        >
                            <RefreshCw size={14} className={isRefreshing ? 'animate-spin text-blue-600' : ''} />
                            Refresh
                        </button>
                    </div>
                </div>

                {/* Toolbar Row: Quick Presets + Custom Date Range */}
                <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-1.5">Window:</span>
                        {[
                            { key: 'all' as const, label: 'All Time' },
                            { key: 'today' as const, label: 'Today' },
                            { key: '7d' as const, label: '7D' },
                            { key: '30d' as const, label: '30D' },
                            { key: 'ytd' as const, label: 'YTD' }
                        ].map((preset) => (
                            <button
                                key={preset.key}
                                type="button"
                                onClick={() => applyPreset(preset.key)}
                                className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${
                                    activePreset === preset.key
                                        ? 'bg-gray-900 text-white shadow-sm'
                                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-800'
                                }`}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-1.5">
                        <Calendar size={14} className="text-gray-400" />
                        <input
                            type="date"
                            aria-label="Start Date"
                            className="bg-transparent text-[11px] font-bold text-gray-700 focus:outline-none w-28"
                            value={dateRange.start}
                            onChange={(e) => {
                                setActivePreset('custom')
                                setDateRange(prev => ({ ...prev, start: e.target.value }))
                            }}
                            suppressHydrationWarning
                        />
                        <span className="text-gray-300">-</span>
                        <input
                            type="date"
                            aria-label="End Date"
                            className="bg-transparent text-[11px] font-bold text-gray-700 focus:outline-none w-28"
                            value={dateRange.end}
                            onChange={(e) => {
                                setActivePreset('custom')
                                setDateRange(prev => ({ ...prev, end: e.target.value }))
                            }}
                            suppressHydrationWarning
                        />
                        {(dateRange.start || dateRange.end) && (
                            <button
                                type="button"
                                onClick={() => applyPreset('all')}
                                className="text-[10px] font-black uppercase text-red-500 hover:text-red-700 pl-1"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Operations Pulse Strip */}
            {opsPulse && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <Link
                        href="/superadmin/approvals"
                        className="group bg-white px-4 py-3.5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-amber-200 transition-all flex items-center justify-between gap-3"
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 rounded-xl bg-amber-50 text-amber-600 shrink-0"><CheckCircle2 size={16} /></div>
                            <div className="min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 truncate">Pending Approvals</p>
                                <p className="text-lg font-black text-gray-900 leading-tight">{opsPulse.pendingApprovals.toLocaleString('en-IN')}</p>
                            </div>
                        </div>
                        <ArrowUpRight size={14} className="text-gray-300 group-hover:text-amber-600 shrink-0" />
                    </Link>

                    <Link
                        href="/finance?tab=payouts"
                        className="group bg-white px-4 py-3.5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all flex items-center justify-between gap-3"
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 shrink-0"><Wallet size={16} /></div>
                            <div className="min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 truncate">Pending Payouts</p>
                                <p className="text-lg font-black text-gray-900 leading-tight">{opsPulse.pendingPayouts.toLocaleString('en-IN')}</p>
                            </div>
                        </div>
                        <ArrowUpRight size={14} className="text-gray-300 group-hover:text-emerald-600 shrink-0" />
                    </Link>

                    <Link
                        href={selectedCampus !== 'all' ? `/superadmin/referrals?campus=${encodeURIComponent(selectedCampus)}` : '/superadmin/referrals'}
                        className="group bg-white px-4 py-3.5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all flex items-center justify-between gap-3"
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 shrink-0"><GitFork size={16} /></div>
                            <div className="min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 truncate">Open Leads</p>
                                <p className="text-lg font-black text-gray-900 leading-tight">{openLeadsCount.toLocaleString('en-IN')}</p>
                            </div>
                        </div>
                        <ArrowUpRight size={14} className="text-gray-300 group-hover:text-indigo-600 shrink-0" />
                    </Link>

                    <Link
                        href="/tickets"
                        className="group bg-white px-4 py-3.5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-rose-200 transition-all flex items-center justify-between gap-3"
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 rounded-xl bg-rose-50 text-rose-600 shrink-0"><LifeBuoy size={16} /></div>
                            <div className="min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 truncate">Urgent Tickets</p>
                                <p className="text-lg font-black text-gray-900 leading-tight">{opsPulse.urgentTickets.toLocaleString('en-IN')}</p>
                            </div>
                        </div>
                        <ArrowUpRight size={14} className="text-gray-300 group-hover:text-rose-600 shrink-0" />
                    </Link>
                </div>
            )}

            <StatsCards analytics={displayedAnalytics} growthTrend={displayedTrendData} selectedCampus={selectedCampus} />

            {isMounted && (
                <ExecutiveInsightsPanel
                    campus={selectedCampus}
                    academicYear={selectedYear}
                    startDate={dateRange.start || undefined}
                    endDate={dateRange.end || undefined}
                />
            )}

            {/* Operational & Growth Trends Section */}
            <div className="pt-8 border-t border-gray-100 space-y-6">
                <div>
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                        <TrendingUp className="text-blue-600" size={24} />
                        Growth &amp; Distribution
                    </h2>
                    <p className="text-[13px] font-bold text-gray-400 mt-1 uppercase tracking-widest">Network expansion and demographic structure</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* User Growth */}
                    <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)]">
                        <div className="flex items-start justify-between gap-4 mb-6">
                            <div>
                                <h3 className="text-xl font-black text-gray-900 tracking-tight">Growth Velocity</h3>
                                <p className="text-[13px] font-semibold text-gray-400">
                                    {trendMode === 'daily' ? 'Daily ambassador registrations' : 'Cumulative registrations in window'}
                                </p>
                            </div>
                            <div className="flex bg-gray-100 p-1 rounded-xl shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setTrendMode('daily')}
                                    className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                        trendMode === 'daily' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                                    }`}
                                >
                                    Daily
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTrendMode('cumulative')}
                                    className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                        trendMode === 'cumulative' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                                    }`}
                                >
                                    Cumulative
                                </button>
                            </div>
                        </div>
                        <div className="h-[350px]">
                            {isMounted && (
                                <GrowthTrendChart
                                    data={displayedTrendData}
                                    dataKey={trendMode === 'daily' ? 'users' : 'cumulative'}
                                    seriesName={trendMode === 'daily' ? 'New Ambassadors' : 'Total Ambassadors'}
                                />
                            )}
                        </div>
                    </div>

                    {/* Role Distribution */}
                    <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)]">
                        <div className="mb-6">
                            <h3 className="text-xl font-black text-gray-900 tracking-tight">Lead Structure</h3>
                            <p className="text-[13px] font-semibold text-gray-400">Referrer role breakdown</p>
                        </div>
                        <div className="h-[350px]">
                            {isMounted && <GenericPieChart data={displayedAnalytics.userRoleDistribution || []} dataKey="value" nameKey="name" />}
                        </div>
                    </div>

                    {/* Heatmap - Full Width */}
                    <div className="lg:col-span-2">
                        {isMounted && <RetentionHeatmap campus={selectedCampus} />}
                    </div>
                </div>
            </div>

            {/* SECTION 2: CAMPUS BENCHMARKS */}
            <div className="pt-8 border-t border-gray-200">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
                    <h2 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                        <Target className="text-blue-600" size={28} />
                        Campus Management
                    </h2>
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                        Click any campus bar to drill down
                    </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                    {/* Enrollment Mix */}
                    <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)]">
                        <div className="mb-6">
                            <h3 className="text-xl font-black text-gray-900 tracking-tight">Campus Enrollment Mix</h3>
                            <p className="text-[13px] font-semibold text-gray-400">Yield distribution across Achariya network</p>
                        </div>
                        <div className="h-[350px]">
                            <CampusBarChart data={displayedCampusData} onSelectCampus={handleBarCampusSelect} />
                        </div>
                    </div>

                    {/* Efficiency Chart */}
                    <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)]">
                        <div className="mb-6">
                            <h3 className="text-xl font-black text-gray-900 tracking-tight">Conversion Efficiency (%)</h3>
                            <p className="text-[13px] font-semibold text-gray-400">Performance by campus</p>
                        </div>
                        <div className="h-[350px]">
                            <CampusEfficiencyChart data={displayedCampusData || []} onSelectCampus={handleBarCampusSelect} />
                        </div>
                    </div>
                </div>

                {/* Full Width Table */}
                <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-8 border-b border-gray-100">
                        <h3 className="text-xl font-black text-gray-900">Detailed Campus Comparison</h3>
                        <p className="text-sm text-gray-500 mt-1">Comprehensive breakdown of leads and admissions</p>
                    </div>
                    <CampusPerformanceTable
                        comparison={displayedCampusData}
                        isExpanded={isTableExpanded}
                        onToggleExpand={() => setIsTableExpanded(!isTableExpanded)}
                    />
                </div>
            </div>
        </div>
    )
}
