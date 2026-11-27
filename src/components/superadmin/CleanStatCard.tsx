'use client'

import Link from 'next/link'
import { LucideIcon, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { motion } from 'framer-motion'

interface CleanStatCardProps {
    title: string
    value: string | number
    icon: LucideIcon
    iconColor: string
    change?: {
        value: number
        isIncrease: boolean
    }
    subtext: string | React.ReactNode
    href?: string
    sparkline?: React.ReactNode
    compact?: boolean
}

export function CleanStatCard({
    title,
    value,
    icon: Icon,
    iconColor,
    change,
    subtext,
    href,
    sparkline,
    compact = false
}: CleanStatCardProps) {
    const cardBody = (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className={`group bg-white border border-gray-100 shadow-sm transition-all duration-300 h-full flex flex-col justify-between ${
                compact ? 'rounded-2xl p-5' : 'rounded-[28px] p-6'
            } ${href ? 'cursor-pointer hover:shadow-xl hover:-translate-y-1 hover:border-indigo-200/80' : 'hover:shadow-lg hover:-translate-y-0.5'}`}
        >
            <div>
                <div className={`flex justify-between items-start ${compact ? 'mb-3' : 'mb-5'}`}>
                    <div className={`${compact ? 'w-10 h-10 rounded-xl' : 'w-12 h-12 rounded-2xl'} ${iconColor} flex items-center justify-center transition-transform duration-500 group-hover:scale-110 shadow-sm`}>
                        <Icon size={compact ? 19 : 22} strokeWidth={2.5} />
                    </div>
                    <div className="flex items-center gap-1.5">
                        {change && (
                            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                                change.isIncrease ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                            }`}>
                                {change.isIncrease ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                                {change.value.toFixed(1)}%
                            </div>
                        )}
                        {href && (
                            <span className="p-1 rounded-full text-gray-300 group-hover:text-indigo-600 group-hover:bg-indigo-50 transition-colors">
                                <ArrowUpRight size={14} />
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex items-end justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.18em] truncate">{title}</p>
                        <h3 className={`${compact ? 'text-2xl' : 'text-3xl'} font-black text-gray-900 tracking-tight italic truncate`}>
                            {value}
                        </h3>
                    </div>
                    {sparkline && (
                        <div className="w-24 h-11 shrink-0 opacity-85 group-hover:opacity-100 transition-opacity">
                            {sparkline}
                        </div>
                    )}
                </div>
            </div>

            <div className={`${compact ? 'mt-3 pt-3' : 'mt-4 pt-4'} border-t border-gray-50`}>
                <div className="text-[11px] font-bold text-gray-500 min-h-[20px]">
                    {subtext}
                </div>
            </div>
        </motion.div>
    )

    if (href) {
        return <Link href={href} className="block h-full">{cardBody}</Link>
    }

    return cardBody
}
