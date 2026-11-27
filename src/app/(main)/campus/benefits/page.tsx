import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, AlertCircle, ShieldCheck } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth-service'
import { hasPermission } from '@/lib/permission-service'
import { getCampusPartnerBenefits } from '@/app/actions/campus-dashboard-actions'
import { AcademicYearFilter } from '@/components/AcademicYearFilter'
import { CampusBenefitsClient } from './campus-benefits-client'

export const dynamic = 'force-dynamic'

export default async function CampusBenefitsPage({
    searchParams
}: {
    searchParams: Promise<{ year?: string }>
}) {
    const user = await getCurrentUser()
    if (!user) redirect('/')
    if (user.role !== 'Super Admin' && !(await hasPermission('settlements'))) {
        redirect('/campus')
    }

    const params = await searchParams
    const selectedYear = params?.year || 'All'

    const res = await getCampusPartnerBenefits(selectedYear)

    if (!res.success || !res.summary || !res.partners) {
        return (
            <div className="p-8 text-center flex flex-col items-center gap-4">
                <AlertCircle size={40} className="text-rose-500" />
                <p className="text-sm font-bold text-rose-600">{res.error || 'Unable to load partner benefits'}</p>
                <Link
                    href="/campus"
                    className="px-4 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold uppercase tracking-wider"
                >
                    Back to Campus Home
                </Link>
            </div>
        )
    }

    return (
        <div className="space-y-6 max-w-[1600px] mx-auto pb-10 animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                <div>
                    <Link
                        href="/campus"
                        className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-900 text-xs font-bold uppercase tracking-wider mb-2"
                    >
                        <ArrowLeft size={14} /> Back to Campus Home
                    </Link>
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight">
                        Partner Benefits &amp; Payout Tracker
                    </h1>
                    <p className="text-xs font-semibold text-gray-500 mt-0.5 flex items-center gap-1.5">
                        <ShieldCheck size={14} className="text-emerald-600" />
                        <span>{res.summary.campusName} • Read-only live sync with Finance Ledger</span>
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <AcademicYearFilter />
                </div>
            </div>

            <CampusBenefitsClient
                summary={res.summary}
                partners={res.partners}
                selectedYear={selectedYear}
            />
        </div>
    )
}
