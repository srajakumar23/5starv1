'use client'

import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import {
    Users,
    IndianRupee,
    CheckCircle2,
    Clock,
    AlertTriangle,
    Search,
    Download,
    Eye,
    X,
    Phone,
    GraduationCap,
    Receipt,
    Landmark,
    ShieldCheck,
    FileSpreadsheet
} from 'lucide-react'
import type {
    CampusPartnerBenefitRow,
    CampusPartnerBenefitsSummary
} from '@/app/actions/campus-dashboard-actions'

interface CampusBenefitsClientProps {
    summary: CampusPartnerBenefitsSummary
    partners: CampusPartnerBenefitRow[]
    selectedYear: string
}

type StatusFilter = 'ALL' | 'PAID' | 'PARTIAL' | 'PENDING' | 'BANK_MISSING' | 'NO_EARNINGS'
type GroupFilter = 'ALL' | 'Group A' | 'Group B'
type DrawerTab = 'referrals' | 'breakdown' | 'payouts'

function formatRs(amount: number): string {
    return `₹${Math.round(amount || 0).toLocaleString('en-IN')}`
}

function getStatusBadge(status: CampusPartnerBenefitRow['payoutStatus']) {
    switch (status) {
        case 'PAID':
            return {
                label: 'Paid / Waived',
                classes: 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }
        case 'PARTIAL':
            return {
                label: 'Partially Paid',
                classes: 'bg-blue-50 text-blue-700 border-blue-200'
            }
        case 'BANK_MISSING':
            return {
                label: 'Bank Details Missing',
                classes: 'bg-rose-50 text-rose-700 border-rose-200'
            }
        case 'PENDING':
            return {
                label: 'Pending Finance',
                classes: 'bg-amber-50 text-amber-700 border-amber-200'
            }
        default:
            return {
                label: 'Leads In Pipeline',
                classes: 'bg-gray-100 text-gray-600 border-gray-200'
            }
    }
}

export function CampusBenefitsClient({
    summary,
    partners,
    selectedYear
}: CampusBenefitsClientProps) {
    // Hooks strictly at top level
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
    const [groupFilter, setGroupFilter] = useState<GroupFilter>('ALL')
    const [selectedPartner, setSelectedPartner] = useState<CampusPartnerBenefitRow | null>(null)
    const [drawerTab, setDrawerTab] = useState<DrawerTab>('referrals')

    const filteredPartners = useMemo(() => {
        const q = searchQuery.trim().toLowerCase()
        return partners.filter(p => {
            if (statusFilter !== 'ALL' && p.payoutStatus !== statusFilter) return false
            if (groupFilter !== 'ALL' && p.group !== groupFilter) return false
            if (!q) return true

            const matchesPartner =
                p.fullName.toLowerCase().includes(q) ||
                p.mobileNumber.toLowerCase().includes(q) ||
                p.referralCode.toLowerCase().includes(q) ||
                p.role.toLowerCase().includes(q)

            if (matchesPartner) return true

            return p.referrals.some(r =>
                r.studentName.toLowerCase().includes(q) ||
                r.parentName.toLowerCase().includes(q) ||
                (r.admissionNumber && r.admissionNumber.toLowerCase().includes(q))
            )
        })
    }, [partners, searchQuery, statusFilter, groupFilter])

    const disbursedPct = summary.totalEarned > 0
        ? Math.min(100, Math.round((summary.totalSettled / summary.totalEarned) * 100))
        : 0

    const statusCounts = useMemo(() => {
        const counts = { PAID: 0, PARTIAL: 0, PENDING: 0, BANK_MISSING: 0, NO_EARNINGS: 0 }
        for (const p of partners) {
            counts[p.payoutStatus]++
        }
        return counts
    }, [partners])

    const handleExportCsv = () => {
        const headers = [
            'Partner Name',
            'Role',
            'Mobile',
            'Referral Code',
            'Group',
            'Total Leads',
            'Confirmed Admissions',
            'Total Earned (INR)',
            'Received / Waived (INR)',
            'Pending (INR)',
            'Payout Status',
            'Last Received Date',
            'Bank Status'
        ]

        const csvEscape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`

        const rows = filteredPartners.map(p => [
            p.fullName,
            p.role,
            p.mobileNumber,
            p.referralCode,
            p.group,
            p.totalReferrals,
            p.confirmedReferrals,
            p.totalEarned,
            p.totalSettled,
            p.outstanding,
            getStatusBadge(p.payoutStatus).label,
            p.lastPaidDate ? format(new Date(p.lastPaidDate), 'dd MMM yyyy') : 'Not Yet',
            p.hasBankDetails ? (p.bankSummary || 'Ready') : 'Missing Bank A/C'
        ].map(csvEscape).join(','))

        const csv = [headers.map(csvEscape).join(','), ...rows].join('\n')
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        const safeCampus = summary.campusName.replace(/[^a-z0-9]/gi, '_')
        link.download = `campus_partner_benefits_${safeCampus}_${selectedYear}_${format(new Date(), 'yyyyMMdd')}.csv`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
    }

    const openPartnerDrawer = (partner: CampusPartnerBenefitRow, defaultTab: DrawerTab = 'referrals') => {
        setSelectedPartner(partner)
        setDrawerTab(defaultTab)
    }

    return (
        <div className="space-y-6">
            {/* 4 Executive Campus KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <button
                    type="button"
                    onClick={() => setStatusFilter('ALL')}
                    className={`text-left p-5 rounded-2xl border bg-white shadow-sm hover:shadow-md transition-all ${
                        statusFilter === 'ALL' ? 'border-gray-300 ring-2 ring-gray-900/5' : 'border-gray-100'
                    }`}
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Referring Partners</span>
                        <span className="p-2 rounded-xl bg-blue-50 text-blue-600"><Users size={15} /></span>
                    </div>
                    <p className="text-2xl font-black text-gray-900 italic">{summary.totalPartners}</p>
                    <p className="text-[11px] font-bold text-gray-500 mt-1">
                        {summary.partnersWithAdmissions} with admissions ({summary.totalConfirmedAdmissions} students)
                    </p>
                </button>

                <button
                    type="button"
                    onClick={() => setStatusFilter('ALL')}
                    className="text-left p-5 rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition-all"
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Earned Benefits</span>
                        <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600"><IndianRupee size={15} /></span>
                    </div>
                    <p className="text-2xl font-black text-gray-900 italic">{formatRs(summary.totalEarned)}</p>
                    <p className="text-[11px] font-bold text-gray-500 mt-1">Official Finance-synced accrual</p>
                </button>

                <button
                    type="button"
                    onClick={() => setStatusFilter('PAID')}
                    className={`text-left p-5 rounded-2xl border bg-white shadow-sm hover:shadow-md transition-all ${
                        statusFilter === 'PAID' ? 'border-emerald-300 ring-2 ring-emerald-500/10' : 'border-gray-100'
                    }`}
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Received / Waived</span>
                        <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600"><CheckCircle2 size={15} /></span>
                    </div>
                    <p className="text-2xl font-black text-emerald-700 italic">{formatRs(summary.totalSettled)}</p>
                    <div className="mt-2 space-y-1">
                        <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                            <div
                                className="h-full bg-emerald-500 rounded-full transition-all"
                                style={{ width: `${disbursedPct}%` }}
                            />
                        </div>
                        <p className="text-[10px] font-bold text-emerald-700">
                            {disbursedPct}% disbursed • {summary.fullyPaidPartners} partners settled
                        </p>
                    </div>
                </button>

                <button
                    type="button"
                    onClick={() => setStatusFilter(summary.bankMissingPartners > 0 ? 'BANK_MISSING' : 'PENDING')}
                    className={`text-left p-5 rounded-2xl border bg-white shadow-sm hover:shadow-md transition-all ${
                        statusFilter === 'PENDING' || statusFilter === 'BANK_MISSING'
                            ? 'border-amber-300 ring-2 ring-amber-500/10'
                            : 'border-gray-100'
                    }`}
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Pending Balance</span>
                        <span className="p-2 rounded-xl bg-amber-50 text-amber-600"><Clock size={15} /></span>
                    </div>
                    <p className="text-2xl font-black text-amber-700 italic">{formatRs(summary.totalOutstanding)}</p>
                    <p className="text-[11px] font-bold text-gray-500 mt-1">
                        {summary.pendingPayoutPartners} awaiting Finance
                        {summary.bankMissingPartners > 0 && (
                            <span className="text-rose-600 ml-1">• {summary.bankMissingPartners} bank missing</span>
                        )}
                    </p>
                </button>
            </div>

            {/* Filter & Export Bar */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-md">
                        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search partner, mobile, code, student or ERP no..."
                            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-red-500/20 outline-none"
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <select
                            aria-label="Filter by benefit group"
                            value={groupFilter}
                            onChange={(e) => setGroupFilter(e.target.value as GroupFilter)}
                            className="px-3 py-2 text-xs font-bold border border-gray-200 rounded-xl bg-white text-gray-700 outline-none"
                        >
                            <option value="ALL">All Groups</option>
                            <option value="Group A">Group A (Fee Waiver)</option>
                            <option value="Group B">Group B (Cash Payout)</option>
                        </select>

                        <button
                            type="button"
                            onClick={handleExportCsv}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gray-900 hover:bg-black text-white text-xs font-bold transition-all"
                        >
                            <Download size={14} /> Export CSV ({filteredPartners.length})
                        </button>
                    </div>
                </div>

                {/* Status Filter Pills */}
                <div className="flex flex-wrap items-center gap-2">
                    {[
                        { key: 'ALL' as const, label: `All (${partners.length})` },
                        { key: 'PAID' as const, label: `Paid / Waived (${statusCounts.PAID})` },
                        { key: 'PARTIAL' as const, label: `Partial (${statusCounts.PARTIAL})` },
                        { key: 'PENDING' as const, label: `Pending (${statusCounts.PENDING})` },
                        { key: 'BANK_MISSING' as const, label: `Bank Missing (${statusCounts.BANK_MISSING})` },
                        { key: 'NO_EARNINGS' as const, label: `Leads Only (${statusCounts.NO_EARNINGS})` }
                    ].map(tab => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => setStatusFilter(tab.key)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                statusFilter === tab.key
                                    ? 'bg-gray-900 text-white border-gray-900'
                                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Partner Benefits Table */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                {filteredPartners.length === 0 ? (
                    <div className="p-12 text-center">
                        <FileSpreadsheet size={36} className="mx-auto text-gray-300 mb-3" />
                        <p className="text-sm font-bold text-gray-700">No partners match the selected filter.</p>
                        <p className="text-xs text-gray-400 mt-1">Try clearing your search or selecting &quot;All&quot; statuses.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-500">
                                    <th className="text-left py-3.5 px-4 font-black uppercase text-[10px] tracking-wider">Campus Partner</th>
                                    <th className="text-left py-3.5 px-3 font-black uppercase text-[10px] tracking-wider">Benefit Mode</th>
                                    <th className="text-center py-3.5 px-3 font-black uppercase text-[10px] tracking-wider">Referrals &rarr; Admitted</th>
                                    <th className="text-right py-3.5 px-3 font-black uppercase text-[10px] tracking-wider">Earned</th>
                                    <th className="text-right py-3.5 px-3 font-black uppercase text-[10px] tracking-wider">Received</th>
                                    <th className="text-right py-3.5 px-3 font-black uppercase text-[10px] tracking-wider">Pending</th>
                                    <th className="text-left py-3.5 px-4 font-black uppercase text-[10px] tracking-wider">Benefit Status &amp; Date</th>
                                    <th className="text-center py-3.5 px-4 font-black uppercase text-[10px] tracking-wider">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredPartners.map(partner => {
                                    const badge = getStatusBadge(partner.payoutStatus)
                                    const waText = !partner.hasBankDetails && partner.group === 'Group B' && partner.totalEarned > 0
                                        ? `Hello ${partner.fullName}, congratulations on your confirmed admission(s) at ${summary.campusName}! Please update your Bank Account & IFSC details in your 5-Star Ambassador Profile so Finance can release your ${formatRs(partner.outstanding)} benefit.`
                                        : `Hello ${partner.fullName}, thank you for supporting ${summary.campusName} via 5-Star Ambassador!`
                                    const waUrl = partner.mobileNumber
                                        ? `https://wa.me/${partner.mobileNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(waText)}`
                                        : null

                                    return (
                                        <tr
                                            key={partner.userId}
                                            onClick={() => openPartnerDrawer(partner)}
                                            className="hover:bg-blue-50/30 cursor-pointer transition-colors"
                                        >
                                            <td className="py-3.5 px-4">
                                                <div className="font-bold text-gray-900">{partner.fullName}</div>
                                                <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                                                    <span className="font-semibold text-gray-600">{partner.role}</span>
                                                    <span>&bull;</span>
                                                    <span className="font-mono">{partner.mobileNumber}</span>
                                                    {waUrl && (
                                                        <a
                                                            href={waUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            title="Message on WhatsApp"
                                                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold hover:bg-emerald-100"
                                                        >
                                                            <Phone size={10} /> WA
                                                        </a>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="py-3.5 px-3">
                                                <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-black uppercase border ${
                                                    partner.group === 'Group A'
                                                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                                                        : 'bg-sky-50 text-sky-700 border-sky-200'
                                                }`}>
                                                    {partner.group === 'Group A' ? 'Group A • Waiver' : 'Group B • Cash'}
                                                </span>
                                                <div className="text-[10px] text-gray-400 font-semibold mt-1">
                                                    {partner.hasBankDetails ? (
                                                        <span className="text-emerald-600">Bank Ready ✓</span>
                                                    ) : (
                                                        <span className="text-rose-500">No Bank A/C</span>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="py-3.5 px-3 text-center">
                                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200 text-xs font-bold">
                                                    <span className="text-gray-600">{partner.totalReferrals}</span>
                                                    <span className="text-gray-400">&rarr;</span>
                                                    <span className="text-emerald-700 font-black">{partner.confirmedReferrals} Admitted</span>
                                                </div>
                                            </td>

                                            <td className="py-3.5 px-3 text-right font-black text-gray-900 tabular-nums">
                                                {formatRs(partner.totalEarned)}
                                            </td>

                                            <td className="py-3.5 px-3 text-right font-bold text-emerald-700 tabular-nums">
                                                {formatRs(partner.totalSettled)}
                                            </td>

                                            <td className="py-3.5 px-3 text-right font-bold text-amber-700 tabular-nums">
                                                {formatRs(partner.outstanding)}
                                            </td>

                                            <td className="py-3.5 px-4">
                                                <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-black uppercase border ${badge.classes}`}>
                                                    {badge.label}
                                                </span>
                                                {partner.lastPaidDate ? (
                                                    <div className="text-[11px] font-semibold text-gray-500 mt-1">
                                                        Received {format(new Date(partner.lastPaidDate), 'dd MMM yyyy')}
                                                    </div>
                                                ) : partner.hasMissingFeeData && partner.confirmedReferrals > 0 ? (
                                                    <div className="text-[10px] font-semibold text-amber-600 mt-1 flex items-center gap-1">
                                                        <AlertTriangle size={10} /> Fee Master Missing
                                                    </div>
                                                ) : null}
                                            </td>

                                            <td className="py-3.5 px-4 text-center">
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        openPartnerDrawer(partner)
                                                    }}
                                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-900 hover:text-white text-gray-700 text-xs font-bold transition-all"
                                                >
                                                    <Eye size={13} /> 360°
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Slide-Over Partner 360 Drawer (Read-Only) */}
            {selectedPartner && (
                <div
                    className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm flex justify-end"
                    onClick={() => setSelectedPartner(null)}
                >
                    <div
                        className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Drawer Header */}
                        <div className="p-6 border-b border-gray-100 bg-gray-50/70 flex items-start justify-between gap-4">
                            <div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="text-xl font-black text-gray-900">{selectedPartner.fullName}</h2>
                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase border ${getStatusBadge(selectedPartner.payoutStatus).classes}`}>
                                        {getStatusBadge(selectedPartner.payoutStatus).label}
                                    </span>
                                </div>
                                <p className="text-xs font-semibold text-gray-500 mt-1">
                                    {selectedPartner.role} &bull; {selectedPartner.mobileNumber}
                                    {selectedPartner.referralCode ? ` • Code: ${selectedPartner.referralCode}` : ''}
                                </p>
                                <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] font-bold">
                                    <span className="px-2 py-0.5 rounded bg-white border border-gray-200 text-gray-700">
                                        {selectedPartner.group}
                                    </span>
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border ${
                                        selectedPartner.hasBankDetails
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                            : 'bg-rose-50 text-rose-700 border-rose-200'
                                    }`}>
                                        <Landmark size={11} />
                                        {selectedPartner.hasBankDetails
                                            ? (selectedPartner.bankSummary || 'Bank Details Ready')
                                            : 'Bank Details Missing'}
                                    </span>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedPartner(null)}
                                aria-label="Close partner details"
                                className="p-2 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Mini Financial Summary */}
                        <div className="grid grid-cols-3 gap-3 p-4 bg-white border-b border-gray-100">
                            <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
                                <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Earned</div>
                                <div className="text-lg font-black text-gray-900">{formatRs(selectedPartner.totalEarned)}</div>
                            </div>
                            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                                <div className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">Received</div>
                                <div className="text-lg font-black text-emerald-800">{formatRs(selectedPartner.totalSettled)}</div>
                            </div>
                            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                                <div className="text-[10px] font-black text-amber-700 uppercase tracking-wider">Pending</div>
                                <div className="text-lg font-black text-amber-800">{formatRs(selectedPartner.outstanding)}</div>
                            </div>
                        </div>

                        {/* Drawer Tabs */}
                        <div className="flex border-b border-gray-200 px-6 bg-gray-50/40">
                            {[
                                { id: 'referrals' as const, label: `Referrals & Students (${selectedPartner.referrals.length})`, icon: GraduationCap },
                                { id: 'breakdown' as const, label: 'Benefit Split', icon: IndianRupee },
                                { id: 'payouts' as const, label: `Receipt Timeline (${selectedPartner.settlements.length})`, icon: Receipt }
                            ].map(tab => {
                                const Icon = tab.icon
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setDrawerTab(tab.id)}
                                        className={`inline-flex items-center gap-1.5 px-4 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-colors ${
                                            drawerTab === tab.id
                                                ? 'border-gray-900 text-gray-900'
                                                : 'border-transparent text-gray-400 hover:text-gray-700'
                                        }`}
                                    >
                                        <Icon size={13} />
                                        {tab.label}
                                    </button>
                                )
                            })}
                        </div>

                        {/* Drawer Body */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            {drawerTab === 'referrals' && (
                                selectedPartner.referrals.length === 0 ? (
                                    <p className="text-sm text-gray-500 text-center py-8">No referrals found for this campus filter.</p>
                                ) : (
                                    selectedPartner.referrals.map(ref => {
                                        const isConfirmed = ref.leadStatus === 'Confirmed' || ref.leadStatus === 'Admitted'
                                        return (
                                            <div key={ref.leadId} className="p-4 rounded-xl border border-gray-200 bg-white space-y-2">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div>
                                                        <div className="font-bold text-gray-900 text-sm">{ref.studentName}</div>
                                                        <div className="text-xs text-gray-500">
                                                            Parent: {ref.parentName} ({ref.parentMobile}) &bull; {ref.grade}
                                                        </div>
                                                    </div>
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                                                        isConfirmed
                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                            : ref.leadStatus === 'Rejected'
                                                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                                                : 'bg-amber-50 text-amber-700 border-amber-200'
                                                    }`}>
                                                        {ref.leadStatus}
                                                    </span>
                                                </div>

                                                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100 text-xs">
                                                    <div className="text-gray-500">
                                                        {ref.admissionNumber ? (
                                                            <span>ERP / Adm No: <strong className="font-mono text-gray-800">{ref.admissionNumber}</strong></span>
                                                        ) : (
                                                            <span>Submitted {format(new Date(ref.createdAt), 'dd MMM yyyy')}</span>
                                                        )}
                                                        {ref.confirmedDate && (
                                                            <span className="ml-2 text-emerald-700 font-semibold">
                                                                &bull; Admitted {format(new Date(ref.confirmedDate), 'dd MMM yyyy')}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {ref.earnedAmount > 0 && (
                                                        <div className="font-bold text-gray-900">
                                                            Benefit: {formatRs(ref.earnedAmount)}
                                                            <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-black ${
                                                                ref.payoutStatus === 'PAID'
                                                                    ? 'bg-emerald-100 text-emerald-800'
                                                                    : ref.payoutStatus === 'PARTIAL'
                                                                        ? 'bg-blue-100 text-blue-800'
                                                                        : 'bg-amber-100 text-amber-800'
                                                            }`}>
                                                                {ref.payoutStatus}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })
                                )
                            )}

                            {drawerTab === 'breakdown' && (
                                <div className="space-y-3">
                                    <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-center gap-2 text-xs font-semibold text-emerald-800">
                                        <ShieldCheck size={16} />
                                        100% synced with official Finance Benefit Ledger (Read-Only).
                                    </div>
                                    <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
                                        {[
                                            { label: 'Tier / Slab Reward Share', value: selectedPartner.slabShare },
                                            { label: 'Admission Fee Share (80%)', value: selectedPartner.admissionShare },
                                            { label: 'Donation Fee Share (50%)', value: selectedPartner.donationShare },
                                            { label: 'Special Campus Bonus', value: selectedPartner.specialBonusShare }
                                        ].map(item => (
                                            <div key={item.label} className="flex items-center justify-between px-4 py-3 text-sm">
                                                <span className="font-semibold text-gray-600">{item.label}</span>
                                                <span className="font-black text-gray-900 tabular-nums">{formatRs(item.value)}</span>
                                            </div>
                                        ))}
                                        <div className="flex items-center justify-between px-4 py-3.5 text-sm bg-gray-50 font-black">
                                            <span className="text-gray-900">Total Accrued Benefit</span>
                                            <span className="text-indigo-700 tabular-nums">{formatRs(selectedPartner.totalEarned)}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {drawerTab === 'payouts' && (
                                selectedPartner.settlements.length === 0 ? (
                                    <div className="p-8 text-center rounded-xl border border-dashed border-gray-300 bg-gray-50">
                                        <Clock size={28} className="mx-auto text-gray-300 mb-2" />
                                        <p className="text-sm font-bold text-gray-700">No payouts or fee waivers recorded yet</p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {selectedPartner.outstanding > 0
                                                ? `Finance has ${formatRs(selectedPartner.outstanding)} pending disbursement.`
                                                : 'Benefits will appear here once referrals are confirmed and processed by Finance.'}
                                        </p>
                                    </div>
                                ) : (
                                    selectedPartner.settlements.map(s => (
                                        <div key={s.id} className="p-4 rounded-xl border border-gray-200 bg-white space-y-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-base font-black text-gray-900 tabular-nums">{formatRs(s.amount)}</span>
                                                    {s.isRegistrationRefund && (
                                                        <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-bold">
                                                            Reg. Refund
                                                        </span>
                                                    )}
                                                    {s.benefitType && (
                                                        <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold">
                                                            {s.benefitType.replace(/_/g, ' ')}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                                                    s.status === 'Processed'
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                        : 'bg-amber-50 text-amber-700 border-amber-200'
                                                }`}>
                                                    {s.status}
                                                </span>
                                            </div>
                                            <div className="text-xs text-gray-600 flex flex-wrap items-center gap-x-3 gap-y-1">
                                                <span>
                                                    {s.status === 'Processed' ? 'Received on:' : 'Created:'}{' '}
                                                    <strong className="text-gray-900">
                                                        {format(new Date(s.payoutDate || s.createdAt), 'dd MMM yyyy')}
                                                    </strong>
                                                </span>
                                                {s.bankReference && (
                                                    <span>
                                                        UTR / Ref: <strong className="font-mono text-gray-900">{s.bankReference}</strong>
                                                    </span>
                                                )}
                                                {s.paymentMethod && <span>Mode: {s.paymentMethod}</span>}
                                            </div>
                                            {s.remarks && (
                                                <p className="text-[11px] text-gray-500 bg-gray-50 rounded-lg px-2.5 py-1.5">
                                                    {s.remarks}
                                                </p>
                                            )}
                                        </div>
                                    ))
                                )
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
