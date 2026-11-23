export default function CampusLoading() {
    return (
        <div className="space-y-6 animate-pulse p-2">
            <div className="flex justify-between items-center">
                <div className="h-9 w-52 rounded-2xl bg-slate-200/80" />
                <div className="h-9 w-36 rounded-xl bg-slate-200/80" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-28 rounded-3xl bg-white/80 border border-slate-100 shadow-sm" />
                ))}
            </div>
            <div className="h-80 rounded-3xl bg-white/80 border border-slate-100 shadow-sm" />
        </div>
    )
}
