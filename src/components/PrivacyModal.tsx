'use client'

import { useState } from 'react'
import { X, Shield, Lock, Eye, Database, AlertTriangle, LogOut, HelpCircle, CheckCircle2 } from 'lucide-react'

interface Props {
    isOpen: boolean
    onClose: () => void
    canRequestDeletion?: boolean
    isDeletionRequested?: boolean
    referralCount?: number
    securedValue?: number
    onRequestDeletion?: () => Promise<void>
    onCancelDeletion?: () => Promise<void>
    onSignOut?: () => Promise<void>
    onContactSupport?: () => void
}

export function PrivacyModal({
    isOpen,
    onClose,
    canRequestDeletion = false,
    isDeletionRequested = false,
    referralCount = 0,
    securedValue = 0,
    onRequestDeletion,
    onCancelDeletion,
    onSignOut,
    onContactSupport
}: Props) {
    const [showClosurePanel, setShowClosurePanel] = useState(false)
    const [confirmText, setConfirmText] = useState('')
    const [submitting, setSubmitting] = useState(false)

    if (!isOpen) return null

    const handleClosureSubmit = async () => {
        if (!onRequestDeletion || confirmText.trim().toUpperCase() !== 'CLOSE') return
        setSubmitting(true)
        try {
            await onRequestDeletion()
            setShowClosurePanel(false)
            setConfirmText('')
        } finally {
            setSubmitting(false)
        }
    }

    const handleCancelRequest = async () => {
        if (!onCancelDeletion) return
        setSubmitting(true)
        try {
            await onCancelDeletion()
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-[32px] w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-gray-50 to-white">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
                            <Shield size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-gray-900 tracking-tight">Privacy & Data Controls</h3>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-0.5">Data Usage & Protection</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close privacy dialog"
                        className="no-mobile-btn p-2 hover:bg-gray-100 rounded-2xl text-gray-400 hover:text-gray-600 transition-all shadow-sm bg-white"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="overflow-y-auto p-8 max-h-[calc(85vh-170px)] custom-scrollbar space-y-8">
                    {/* Hero Section */}
                    <div className="p-6 bg-emerald-50 rounded-[24px] border border-emerald-100/50">
                        <p className="text-sm text-emerald-900 leading-relaxed font-medium">
                            At <strong>ACHARIYA WORLD CLASS EDUCATION</strong>, your privacy is our priority. We are committed to protecting your personal data and being transparent about how we use it for the 5-Star Ambassador network.
                        </p>
                    </div>

                    {/* Personal Data Section */}
                    <div className="space-y-4">
                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-tight flex items-center gap-2">
                            <Database size={16} className="text-blue-500" />
                            Data We Collect
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {[
                                { title: 'Identity', desc: 'Full Name, Mobile Number, Aadhar Number (for Alumni only).' },
                                { title: 'Professional', desc: 'Employee ID and Campus details (for Staff members).' },
                                { title: 'System', desc: 'Referral links, transaction history, and reward credits.' },
                                { title: 'Media', desc: 'Profile photos you choose to upload.' }
                            ].map((item, i) => (
                                <div key={i} className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                    <p className="text-xs font-black text-gray-900 mb-1 uppercase tracking-tighter">{item.title}</p>
                                    <p className="text-xs text-gray-500 font-medium leading-tight">{item.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* How We Use Section */}
                    <div className="space-y-4">
                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-tight flex items-center gap-2">
                            <Eye size={16} className="text-amber-500" />
                            How We Use It
                        </h4>
                        <ul className="space-y-3">
                            <li className="flex gap-3 text-sm text-gray-600">
                                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full shrink-0 mt-2" />
                                <span>To track referrals and calculate fee benefits accurately.</span>
                            </li>
                            <li className="flex gap-3 text-sm text-gray-600">
                                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full shrink-0 mt-2" />
                                <span>To verify your status as a parent, staff, or alumni of Achariya.</span>
                            </li>
                            <li className="flex gap-3 text-sm text-gray-600">
                                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full shrink-0 mt-2" />
                                <span>To process and verify registration payments and settlements securely.</span>
                            </li>
                        </ul>
                    </div>

                    {/* Your Rights & Account Closure (Play Store Compliant Option A) */}
                    <div className="space-y-4">
                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-tight flex items-center gap-2">
                            <Lock size={16} className="text-slate-600" />
                            Your Rights & Account Controls
                        </h4>
                        <p className="text-sm text-gray-600 leading-relaxed">
                            You have the right to access, correct, or request closure and removal of your personal data. Deletion requests are reviewed by Super Admin so any pending payouts or student records remain reconciled before personal details are scrubbed.
                        </p>

                        {canRequestDeletion && isDeletionRequested && (
                            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-3">
                                <div className="flex items-start gap-3">
                                    <CheckCircle2 size={18} className="text-amber-600 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-xs font-black text-amber-900 uppercase tracking-wide">Account Closure Request Under Review</p>
                                        <p className="text-xs text-amber-800/80 mt-1">
                                            Your request has been sent to the Super Admin team. You can withdraw this request anytime before approval.
                                        </p>
                                    </div>
                                </div>
                                {onCancelDeletion && (
                                    <button
                                        onClick={handleCancelRequest}
                                        disabled={submitting}
                                        className="px-4 py-2 rounded-xl bg-white border border-amber-300 text-amber-900 text-xs font-bold hover:bg-amber-100 transition-colors disabled:opacity-50"
                                    >
                                        {submitting ? 'Updating...' : 'Cancel Closure Request'}
                                    </button>
                                )}
                            </div>
                        )}

                        {canRequestDeletion && !isDeletionRequested && (
                            <div className="pt-2 border-t border-gray-100">
                                {!showClosurePanel ? (
                                    <button
                                        type="button"
                                        onClick={() => setShowClosurePanel(true)}
                                        className="no-mobile-btn text-xs font-bold text-slate-500 hover:text-rose-600 underline underline-offset-4 transition-colors"
                                    >
                                        Need to leave? Request Account Closure &amp; Data Removal
                                    </button>
                                ) : (
                                    <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                                        <div className="flex items-start gap-3">
                                            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                                            <div className="space-y-1">
                                                <p className="text-xs font-black text-gray-900 uppercase tracking-wide">
                                                    Before You Request Account Closure
                                                </p>
                                                <p className="text-xs text-gray-600 leading-relaxed">
                                                    Submitting a closure request asks Super Admin to permanently scrub your profile, contact info, and bank details once records are reconciled.
                                                </p>
                                                {(referralCount > 0 || securedValue > 0) && (
                                                    <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5 mt-2">
                                                        Active program summary: <strong>{referralCount}</strong> confirmed referral(s) and{' '}
                                                        <strong>₹{securedValue.toLocaleString('en-IN')}</strong> in tracked benefits.
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            {onSignOut && (
                                                <button
                                                    type="button"
                                                    onClick={onSignOut}
                                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold hover:bg-black transition-colors"
                                                >
                                                    <LogOut size={13} />
                                                    Sign Out Instead
                                                </button>
                                            )}
                                            {onContactSupport && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        onClose()
                                                        onContactSupport()
                                                    }}
                                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-100 transition-colors"
                                                >
                                                    <HelpCircle size={13} />
                                                    Contact Support
                                                </button>
                                            )}
                                        </div>

                                        <div className="pt-3 border-t border-slate-200 space-y-2.5">
                                            <label className="block text-[11px] font-bold text-gray-600">
                                                Type <span className="font-mono text-rose-600">CLOSE</span> to submit an account closure request:
                                            </label>
                                            <input
                                                type="text"
                                                value={confirmText}
                                                onChange={(e) => setConfirmText(e.target.value)}
                                                placeholder="Type CLOSE"
                                                className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-mono text-gray-900 focus:outline-none focus:border-rose-400"
                                            />
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    disabled={submitting || confirmText.trim().toUpperCase() !== 'CLOSE'}
                                                    onClick={handleClosureSubmit}
                                                    className="no-dark-override px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                >
                                                    {submitting ? 'Submitting...' : 'Submit Closure Request'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setShowClosurePanel(false)
                                                        setConfirmText('')
                                                    }}
                                                    className="px-3 py-2 rounded-xl text-xs font-bold text-gray-500 hover:text-gray-800"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="pt-8 border-t border-gray-100">
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest text-center">
                            Last Updated: March 2026 • ACHARIYA WORLD CLASS EDUCATION
                        </p>
                    </div>
                </div>

                <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-center">
                    <button
                        onClick={onClose}
                        className="px-12 py-3 bg-gray-900 text-white font-black text-sm rounded-xl hover:bg-black transition-all shadow-lg shadow-gray-200"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}
