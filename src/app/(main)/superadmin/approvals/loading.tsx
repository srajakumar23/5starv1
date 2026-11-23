export default function ApprovalsLoading() {
    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-pulse">
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <div className="h-9 w-64 rounded-2xl bg-slate-200/80" />
                    <div className="h-4 w-80 rounded-lg bg-slate-200/60" />
                </div>
                <div className="flex gap-3">
                    <div className="h-10 w-32 rounded-lg bg-slate-200/80" />
                    <div className="h-10 w-28 rounded-lg bg-slate-200/80" />
                </div>
            </div>
            <div className="h-96 rounded-2xl bg-white/80 border border-slate-100 shadow-sm" />
        </div>
    )
}
