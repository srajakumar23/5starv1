'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Download, X, Calendar, CheckSquare } from 'lucide-react'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface ExportDateRangeModalProps {
    isOpen: boolean
    onClose: () => void
    title?: string
    description?: string
    showStatusFilter?: boolean
    columns?: { id: string; label: string; defaultChecked?: boolean }[]
    onExport: (startDate: Date, endDate: Date, status?: string, selectedColumns?: string[]) => Promise<void>
}

type PresetKey = '7' | '30' | '90' | 'ytd' | 'all' | 'custom'

function toLocalInputDate(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

export function ExportDateRangeModal({
    isOpen,
    onClose,
    onExport,
    title = 'Export Report',
    description = 'Select a date range and columns to download CSV.',
    showStatusFilter = false,
    columns = []
}: ExportDateRangeModalProps) {
    const [mounted, setMounted] = useState(false)
    const [startDate, setStartDate] = useState<string>('')
    const [endDate, setEndDate] = useState<string>('')
    const [activePreset, setActivePreset] = useState<PresetKey>('ytd')
    const [status, setStatus] = useState<string>('All')
    const [selectedColumns, setSelectedColumns] = useState<string[]>([])
    const [isExporting, setIsExporting] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    // Initialize default columns
    useEffect(() => {
        if (columns.length > 0) {
            setSelectedColumns(columns.filter(c => c.defaultChecked !== false).map(c => c.id))
        }
    }, [columns])

    // Auto-preselect YTD date range when opening if empty
    useEffect(() => {
        if (isOpen && (!startDate || !endDate)) {
            const now = new Date()
            const ytdStart = new Date(now.getFullYear(), 0, 1)
            setStartDate(toLocalInputDate(ytdStart))
            setEndDate(toLocalInputDate(now))
            setActivePreset('ytd')
        }
    }, [isOpen, startDate, endDate])

    // Lock background scroll & support Escape to close
    useEffect(() => {
        if (!isOpen) return
        const prevOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isExporting) onClose()
        }
        window.addEventListener('keydown', handleKeyDown)

        return () => {
            document.body.style.overflow = prevOverflow
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [isOpen, isExporting, onClose])

    if (!mounted) return null

    const applyDaysPreset = (days: 7 | 30 | 90) => {
        const end = new Date()
        const start = new Date()
        start.setDate(end.getDate() - days)
        setStartDate(toLocalInputDate(start))
        setEndDate(toLocalInputDate(end))
        setActivePreset(String(days) as PresetKey)
    }

    const applyYtdPreset = () => {
        const now = new Date()
        const start = new Date(now.getFullYear(), 0, 1)
        setStartDate(toLocalInputDate(start))
        setEndDate(toLocalInputDate(now))
        setActivePreset('ytd')
    }

    const applyAllTimePreset = () => {
        setStartDate('2024-01-01')
        setEndDate(toLocalInputDate(new Date()))
        setActivePreset('all')
    }

    const handleExport = async () => {
        if (!startDate || !endDate) return
        if (columns.length > 0 && selectedColumns.length === 0) return

        setIsExporting(true)
        try {
            await onExport(
                new Date(startDate),
                new Date(endDate),
                status,
                columns.length > 0 ? selectedColumns : undefined
            )
            onClose()
        } catch (error) {
            console.error(error)
        } finally {
            setIsExporting(false)
        }
    }

    const hasNoSelectedColumns = columns.length > 0 && selectedColumns.length === 0

    const modalContent = (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => !isExporting && onClose()}
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 8 }}
                        transition={{ duration: 0.18 }}
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-label={title}
                        className="bg-white w-full max-w-lg max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col"
                    >
                        {/* Fixed Header */}
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/60 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                                    <Download size={20} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900 leading-tight">{title}</h3>
                                    <p className="text-xs text-gray-500 mt-0.5">{description}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => !isExporting && onClose()}
                                aria-label="Close modal"
                                className="p-1.5 hover:bg-gray-200/80 rounded-full transition-colors text-gray-400 hover:text-gray-700"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Scrollable Body */}
                        <div className="p-6 space-y-5 overflow-y-auto flex-1">
                            {/* Quick Date Presets */}
                            <div className="space-y-2">
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                                    <Calendar size={13} /> Quick Range
                                </span>
                                <div className="flex flex-wrap gap-2">
                                    {[
                                        { key: '7' as const, label: 'Last 7 Days', action: () => applyDaysPreset(7) },
                                        { key: '30' as const, label: 'Last 30 Days', action: () => applyDaysPreset(30) },
                                        { key: '90' as const, label: 'Last 90 Days', action: () => applyDaysPreset(90) },
                                        { key: 'ytd' as const, label: 'YTD', action: applyYtdPreset },
                                        { key: 'all' as const, label: 'All Time', action: applyAllTimePreset },
                                    ].map((preset) => (
                                        <button
                                            key={preset.key}
                                            type="button"
                                            onClick={preset.action}
                                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border ${
                                                activePreset === preset.key
                                                    ? 'bg-gray-900 text-white border-gray-900 shadow-sm'
                                                    : 'bg-gray-100 hover:bg-gray-200 text-gray-600 border-transparent'
                                            }`}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Custom Date Inputs */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                                        Start Date
                                    </label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => {
                                            setStartDate(e.target.value)
                                            setActivePreset('custom')
                                        }}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-medium bg-white"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                                        End Date
                                    </label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => {
                                            setEndDate(e.target.value)
                                            setActivePreset('custom')
                                        }}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-medium bg-white"
                                    />
                                </div>
                            </div>

                            {showStatusFilter && (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Status</label>
                                    <select
                                        value={status}
                                        onChange={(e) => setStatus(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-medium bg-white"
                                    >
                                        <option value="All">All Statuses</option>
                                        <option value="Pending">Pending</option>
                                        <option value="Processed">Processed</option>
                                    </select>
                                </div>
                            )}

                            {/* Column Checklist */}
                            {columns.length > 0 && (
                                <div className="space-y-3 pt-3 border-t border-gray-100">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <label className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                                                <CheckSquare size={15} className="text-blue-600" />
                                                Include Columns
                                            </label>
                                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                                {selectedColumns.length}/{columns.length}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (selectedColumns.length === columns.length) {
                                                    setSelectedColumns([])
                                                } else {
                                                    setSelectedColumns(columns.map(c => c.id))
                                                }
                                            }}
                                            className="text-xs font-bold text-blue-600 hover:text-blue-700"
                                        >
                                            {selectedColumns.length === columns.length ? 'Deselect All' : 'Select All'}
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {columns.map(col => {
                                            const checked = selectedColumns.includes(col.id)
                                            return (
                                                <label
                                                    key={col.id}
                                                    className={`flex items-center gap-2 text-xs font-semibold cursor-pointer p-2 rounded-xl border transition-all ${
                                                        checked
                                                            ? 'bg-blue-50/70 border-blue-200 text-gray-900'
                                                            : 'bg-gray-50/50 border-gray-200/80 text-gray-500 hover:bg-gray-100'
                                                    }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setSelectedColumns([...selectedColumns, col.id])
                                                            } else {
                                                                setSelectedColumns(selectedColumns.filter(id => id !== col.id))
                                                            }
                                                        }}
                                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                                                    />
                                                    <span className="truncate">{col.label}</span>
                                                </label>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Sticky Footer */}
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between gap-3 shrink-0">
                            <span className="text-[11px] font-medium text-gray-400 hidden sm:inline">
                                {hasNoSelectedColumns ? 'Select at least 1 column' : 'Ready to export CSV'}
                            </span>
                            <div className="flex items-center gap-2 ml-auto">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    disabled={isExporting}
                                    className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-200/70 rounded-xl transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleExport}
                                    disabled={!startDate || !endDate || hasNoSelectedColumns || isExporting}
                                    className="px-5 py-2 text-sm font-bold text-white bg-black hover:bg-gray-800 rounded-xl transition-all shadow-lg shadow-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    <Download size={15} />
                                    {isExporting ? 'Generating...' : 'Download CSV'}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )

    return createPortal(modalContent, document.body)
}
