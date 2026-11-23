export default function DashboardLoading() {
    return (
        <div className="space-y-6 animate-pulse p-2">
            <div className="h-44 rounded-3xl bg-slate-800/60 border border-white/10" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-28 rounded-2xl bg-slate-800/50 border border-white/10" />
                ))}
            </div>
            <div className="h-72 rounded-3xl bg-slate-800/50 border border-white/10" />
        </div>
    )
}
