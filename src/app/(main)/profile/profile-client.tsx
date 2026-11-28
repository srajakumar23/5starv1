'use client'

import { useState, useEffect } from 'react'
import {
    Star, Phone, Award, Shield, Edit2, Check, X, Mail, MapPin,
    User, Camera, LogOut, ChevronRight, HelpCircle, CreditCard,
    Lock, Smartphone, Download, GraduationCap, Copy, Eye, EyeOff, KeyRound, Clock
} from 'lucide-react'
import { toast } from 'sonner'
import { PrivacyModal } from '@/components/PrivacyModal'
import { requestAccountDeletion, cancelAccountDeletion } from '@/app/deletion-actions'
import { changePassword } from './actions'
import { PageAnimate } from '@/components/PageAnimate'
import { GRADES } from '@/lib/constants'
import { getCampuses } from '@/app/campus-actions'
import { getGradesForCampus } from '@/lib/grade-utils'
import { ifscSchema, accountNumberSchema } from '@/lib/validators'
import { useRouter } from 'next/navigation'

interface ProfileClientProps {
    user: {
        isAdmin?: boolean
        userId?: number
        adminId?: number
        fullName: string
        mobileNumber?: string
        adminMobile?: string
        role: string
        referralCode?: string
        assignedCampus?: string
        yearFeeBenefitPercent?: number
        longTermBenefitPercent?: number
        profileImage?: string
        email?: string
        address?: string
        createdAt: string
        confirmedReferralCount?: number
        studentFee?: number
        // New fields
        childName?: string
        grade?: string
        childEprNo?: string
        childCampusId?: number
        empId?: string
        transactionId?: string
        childInAchariya?: boolean
        status?: string
        benefitStatus?: string
        bankName?: string
        accountNumber?: string
        ifscCode?: string
        securedValue?: number
        projectedValue?: number
    }
    logoutAction: () => Promise<{ success: boolean; error?: string }>
}

function maskAccountNumber(acc: string): string {
    const clean = acc.trim()
    if (clean.length <= 4) return clean
    return `${'•'.repeat(Math.min(8, clean.length - 4))}${clean.slice(-4)}`
}

export default function ProfileClient({ user, logoutAction }: ProfileClientProps) {
    const router = useRouter()
    const isAdmin = Boolean(user.isAdmin)
    const isLight = isAdmin

    const [isEditingProfile, setIsEditingProfile] = useState(false)
    const [isEditingBank, setIsEditingBank] = useState(false)
    const [isChangingPassword, setIsChangingPassword] = useState(false)

    const [fullName, setFullName] = useState(user.fullName)
    const [email, setEmail] = useState(user.email || '')
    const [address, setAddress] = useState(user.address || '')
    const [bankName, setBankName] = useState(user.bankName || '')
    const [accountNumber, setAccountNumber] = useState(user.accountNumber || '')
    const [ifscCode, setIfscCode] = useState(user.ifscCode || '')
    const [showAccountNumber, setShowAccountNumber] = useState(false)
    const [copiedCode, setCopiedCode] = useState(false)

    const [childEprNo, setChildEprNo] = useState(user.childEprNo || '')
    const [childName, setChildName] = useState(user.childName || '')
    const [grade, setGrade] = useState(user.grade || '')
    const [profileImage, setProfileImage] = useState(user.profileImage)
    const [saving, setSaving] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [showPrivacyModal, setShowPrivacyModal] = useState(false)
    const [accountStatus, setAccountStatus] = useState(user.status || 'Active')
    const [cancellingDeletion, setCancellingDeletion] = useState(false)

    // Change Password states
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPasswords, setShowPasswords] = useState(false)
    const [savingPassword, setSavingPassword] = useState(false)

    // Campus loading + native APK detection
    const [campuses, setCampuses] = useState<any[]>([])
    const [campusesLoaded, setCampusesLoaded] = useState(false)
    const [childCampusId, setChildCampusId] = useState<string>(
        user.childCampusId ? user.childCampusId.toString() : ''
    )
    const [isNativeApp, setIsNativeApp] = useState(false)

    useEffect(() => {
        if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()) {
            setIsNativeApp(true)
        }
    }, [])

    useEffect(() => {
        if (!isAdmin && ((user.role === 'Staff' && user.childInAchariya) || user.role === 'Parent')) {
            const fetchCampuses = async () => {
                try {
                    const res = await getCampuses()
                    if (res.success && res.campuses) {
                        setCampuses(res.campuses)
                    }
                } finally {
                    setCampusesLoaded(true)
                }
            }
            fetchCampuses()
        }
    }, [isAdmin, user.role, user.childInAchariya])

    const referralCount = user.confirmedReferralCount || 0

    const copyPartnerCode = async (code: string) => {
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(code)
            } else {
                const ta = document.createElement('textarea')
                ta.value = code
                ta.style.position = 'fixed'
                ta.style.opacity = '0'
                document.body.appendChild(ta)
                ta.select()
                document.execCommand('copy')
                document.body.removeChild(ta)
            }
            setCopiedCode(true)
            toast.success('Partner ID copied')
            setTimeout(() => setCopiedCode(false), 2000)
        } catch {
            toast.error('Failed to copy Partner ID')
        }
    }

    const compressProfileImage = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onerror = () => reject(new Error('Failed to read image file'))
            reader.onloadend = () => {
                const rawDataUrl = reader.result as string
                if (!rawDataUrl || typeof window === 'undefined') {
                    resolve(rawDataUrl)
                    return
                }
                const img = new window.Image()
                img.onload = () => {
                    const maxDim = 400
                    const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1))
                    const targetW = Math.max(1, Math.round(img.width * scale))
                    const targetH = Math.max(1, Math.round(img.height * scale))
                    const canvas = document.createElement('canvas')
                    canvas.width = targetW
                    canvas.height = targetH
                    const ctx = canvas.getContext('2d')
                    if (!ctx) {
                        resolve(rawDataUrl)
                        return
                    }
                    ctx.drawImage(img, 0, 0, targetW, targetH)
                    resolve(canvas.toDataURL('image/jpeg', 0.82))
                }
                img.onerror = () => resolve(rawDataUrl)
                img.src = rawDataUrl
            }
            reader.readAsDataURL(file)
        })
    }

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        if (!file.type.startsWith('image/')) {
            toast.error('Please select a valid image file')
            return
        }

        setUploading(true)
        try {
            const optimizedImage = await compressProfileImage(file)
            const response = await fetch('/api/profile/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: optimizedImage })
            })
            if (response.ok) {
                const resData = await response.json().catch(() => ({}))
                setProfileImage(resData.profileImage || optimizedImage)
                toast.success('Photo updated successfully')
                router.refresh()
            } else {
                const errData = await response.json().catch(() => ({}))
                toast.error(errData.error || 'Failed to upload photo')
            }
        } catch {
            toast.error('Error uploading photo')
        } finally {
            setUploading(false)
        }
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            const canEditChild = !isAdmin && !user.childInAchariya && ((user.role === 'Staff' && user.childInAchariya) || user.role === 'Parent')

            const body = {
                fullName,
                email,
                address,
                ...(isEditingProfile && canEditChild && {
                    childEprNo,
                    childName,
                    grade,
                    childCampusId: childCampusId ? parseInt(childCampusId) : undefined
                }),
                ...(isEditingBank && !isAdmin && {
                    bankName,
                    accountNumber,
                    ifscCode,
                })
            }

            if (isEditingBank && !isAdmin) {
                if (ifscCode) {
                    const result = ifscSchema.safeParse(ifscCode)
                    if (!result.success) {
                        toast.error(result.error.issues[0].message)
                        setSaving(false)
                        return
                    }
                }
                if (accountNumber) {
                    const result = accountNumberSchema.safeParse(accountNumber)
                    if (!result.success) {
                        toast.error(result.error.issues[0].message)
                        setSaving(false)
                        return
                    }
                }
            }

            const response = await fetch('/api/profile/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })
            if (response.ok) {
                toast.success('Profile updated successfully')
                setIsEditingProfile(false)
                setIsEditingBank(false)
                router.refresh()
            } else {
                const data = await response.json().catch(() => ({}))
                toast.error(data.error || 'Failed to update profile')
            }
        } catch {
            toast.error('Error updating profile')
        } finally {
            setSaving(false)
        }
    }

    const handleCancel = () => {
        setFullName(user.fullName)
        setEmail(user.email || '')
        setAddress(user.address || '')
        setBankName(user.bankName || '')
        setAccountNumber(user.accountNumber || '')
        setIfscCode(user.ifscCode || '')
        setChildEprNo(user.childEprNo || '')
        setChildName(user.childName || '')
        setGrade(user.grade || '')
        setChildCampusId(user.childCampusId ? user.childCampusId.toString() : '')
        setIsEditingProfile(false)
        setIsEditingBank(false)
    }

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSavingPassword(true)
        try {
            const fd = new FormData()
            fd.set('currentPassword', currentPassword)
            fd.set('newPassword', newPassword)
            fd.set('confirmPassword', confirmPassword)
            const res = await changePassword(null, fd)
            if (res.success) {
                toast.success(res.message || 'Password updated successfully')
                setCurrentPassword('')
                setNewPassword('')
                setConfirmPassword('')
                setIsChangingPassword(false)
            } else {
                toast.error(res.error || 'Failed to update password')
            }
        } catch {
            toast.error('Failed to update password')
        } finally {
            setSavingPassword(false)
        }
    }

    const handleDeleteRequest = async () => {
        const res = await requestAccountDeletion()
        if (res.success) {
            setAccountStatus('Deletion_Requested')
            toast.success('Account closure request submitted for Super Admin review.')
            router.refresh()
        } else {
            toast.error(res.error || 'Failed to submit request')
        }
    }

    const handleCancelDeleteRequest = async () => {
        setCancellingDeletion(true)
        try {
            const res = await cancelAccountDeletion()
            if (res.success) {
                setAccountStatus(res.status || 'Active')
                toast.success('Account closure request cancelled.')
                router.refresh()
            } else {
                toast.error(res.error || 'Failed to cancel closure request')
            }
        } finally {
            setCancellingDeletion(false)
        }
    }

    const handleSignOut = async () => {
        try {
            const result = await logoutAction()
            if (result.success) {
                router.push('/')
            } else {
                toast.error(result.error || 'Failed to sign out')
            }
        } catch {
            toast.error('Failed to sign out')
        }
    }

    const resolvedStaffCampus = !user.childCampusId
        ? (user.assignedCampus || 'Not Assigned')
        : campuses.find(c => c.id === user.childCampusId)?.campusName ||
          (campusesLoaded ? (user.assignedCampus || 'Not Assigned') : 'Loading...')

    // Theme tokens: Admin sits on light bg-slate-50, Ambassadors sit on dark bg-[#0f172a]
    const cardSurface = isLight
        ? 'bg-white border border-slate-200/90 shadow-sm hover:border-blue-200'
        : 'bg-white/5 border border-white/10 hover:bg-white/10'
    const actionSurface = isLight
        ? 'bg-white border border-slate-200/90 shadow-sm hover:border-blue-300 hover:shadow-md'
        : 'bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/15'
    const formSurface = isLight
        ? 'bg-white border border-slate-200 shadow-sm'
        : 'bg-white/5 border border-white/10'
    const headingText = isLight ? 'text-slate-900' : 'text-white'
    const subLabelText = isLight ? 'text-slate-500' : 'text-white/40'
    const chevronText = isLight ? 'text-slate-400 group-hover:text-slate-700' : 'text-white/25 group-hover:text-white/60'
    const inputClasses = isLight
        ? 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none transition-colors'
        : 'w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:border-amber-500/50 focus:outline-none transition-colors'

    return (
        <div className="relative w-full overflow-x-hidden font-[family-name:var(--font-outfit)]">
            {/* Ambient Background Effects (Dark Ambassador theme only) */}
            {!isLight && (
                <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
                    <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[120px]" />
                    <div className="absolute top-[20%] right-[-10%] w-[400px] h-[400px] bg-indigo-600/10 rounded-full blur-[100px]" />
                </div>
            )}

            {/* Main Content Container */}
            <PageAnimate className={`relative z-10 w-full ${isAdmin ? 'max-w-lg' : 'max-w-md'} mx-auto flex flex-col pb-24`}>

                {/* Self-Contained Rounded Hero Card (Zero overlapping absolute banners) */}
                <div className="relative rounded-3xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-900 p-5 sm:p-6 shadow-2xl border border-white/15 overflow-hidden mb-6">
                    <div className="absolute -top-16 -right-16 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
                    <div className="absolute -bottom-16 -left-16 w-44 h-44 bg-indigo-400/20 rounded-full blur-2xl pointer-events-none" />

                    {/* Top Bar inside Hero */}
                    <div className="relative z-10 flex items-center justify-between mb-6">
                        <h1 className="text-xl font-black text-white tracking-tight uppercase italic">My Profile</h1>

                        {!isEditingProfile && !isEditingBank && !isChangingPassword && (
                            <button
                                type="button"
                                onClick={() => setIsEditingProfile(true)}
                                className="no-dark-override no-mobile-btn p-0 w-10 h-10 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 border border-amber-300 flex items-center justify-center shadow-lg shadow-amber-500/30 active:scale-95 transition-all cursor-pointer"
                                aria-label="Edit Profile"
                                title="Edit Profile"
                            >
                                <Edit2 size={18} strokeWidth={2.5} className="text-slate-950 shrink-0" />
                            </button>
                        )}
                    </div>

                    {/* Avatar, Name, Badges & Metrics */}
                    <div className="relative z-10 flex flex-col items-center">
                        <div className="relative mb-4 group">
                            <div className="absolute -inset-1 bg-gradient-to-tr from-amber-400 to-yellow-500 rounded-full blur opacity-70 animate-pulse" />
                            <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-slate-950/80 bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center overflow-hidden shadow-2xl">
                                {profileImage ? (
                                    <img
                                        src={profileImage}
                                        alt="Profile"
                                        onError={() => setProfileImage(undefined)}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <span className="text-3xl font-bold text-white">{fullName ? fullName.charAt(0).toUpperCase() : <User />}</span>
                                )}
                            </div>

                            <label
                                title="Upload Profile Photo"
                                className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center border-2 border-slate-950 shadow-lg cursor-pointer hover:bg-amber-300 transition-colors"
                            >
                                <Camera size={14} strokeWidth={2.5} />
                                <input
                                    type="file"
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handlePhotoUpload}
                                    disabled={uploading}
                                />
                            </label>
                            {uploading && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                                    <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                </div>
                            )}
                        </div>

                        <h2 className="text-2xl font-black text-white mb-2 text-center tracking-tight">{fullName}</h2>

                        {/* Role / Tier & Partner ID Pill */}
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            {isAdmin ? (
                                <div className="flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-white/15 border border-white/25">
                                    <Shield size={12} className="text-amber-300" />
                                    <span className="text-xs font-bold text-white uppercase tracking-wider">{user.role}</span>
                                </div>
                            ) : user.yearFeeBenefitPercent !== undefined ? (
                                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/15 border border-amber-300/30">
                                    <Star size={12} className="text-amber-300 fill-amber-300" />
                                    <span className="text-xs font-bold text-amber-200 uppercase tracking-wider">
                                        {referralCount >= 5 ? 'Prestigious Partner' : 'Ambassador'}
                                    </span>
                                </div>
                            ) : null}

                            {!isAdmin && user.referralCode && (
                                <button
                                    type="button"
                                    onClick={() => copyPartnerCode(user.referralCode!)}
                                    className="no-dark-override no-mobile-btn flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 border border-white/25 text-xs font-mono font-bold text-white transition-colors"
                                >
                                    <span>{user.referralCode}</span>
                                    {copiedCode ? <Check size={12} className="text-emerald-300" /> : <Copy size={12} className="text-white/80" />}
                                </button>
                            )}
                        </div>

                        {/* Ambassador Metrics Inside Hero Card */}
                        {!isAdmin && (
                            <div className="w-full mt-6 space-y-3">
                                <div className="grid grid-cols-2 gap-3 w-full">
                                    <div className="bg-slate-950/35 border border-white/15 rounded-2xl p-4 flex flex-col items-center text-center backdrop-blur-md">
                                        <span className="text-2xl font-black text-white mb-0.5">{referralCount}</span>
                                        <span className="text-[10px] text-white/60 uppercase tracking-widest font-black">Confirmed Units</span>
                                    </div>
                                    <div className="bg-slate-950/35 border border-white/15 rounded-2xl p-4 flex flex-col items-center text-center backdrop-blur-md">
                                        <span className="text-2xl font-black text-white mb-0.5">₹{user.securedValue?.toLocaleString('en-IN') || '0'}</span>
                                        <span className="text-[10px] text-white/60 uppercase tracking-widest font-black">Total Yield</span>
                                    </div>
                                </div>

                                {(user.projectedValue || 0) > (user.securedValue || 0) && (
                                    <div className="bg-amber-400/15 border border-amber-300/30 rounded-2xl p-4 flex items-center justify-between backdrop-blur-md">
                                        <div>
                                            <p className="text-[9px] text-amber-200/80 font-black uppercase tracking-widest mb-1">Projected Potential</p>
                                            <p className="text-lg font-black text-amber-300 tracking-tight">₹{user.projectedValue?.toLocaleString('en-IN')}</p>
                                        </div>
                                        <div className="p-2 bg-amber-400/20 rounded-xl border border-amber-300/30">
                                            <Award size={20} className="text-amber-300" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Pending Account Closure Status Banner (Ambassadors only) */}
                {!isAdmin && accountStatus === 'Deletion_Requested' && (
                    <div className="w-full mb-6 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-3">
                        <div className="flex items-start gap-3">
                            <Clock size={18} className="text-amber-400 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-xs font-black text-amber-300 uppercase tracking-wider">Account Closure Pending Review</p>
                                <p className="text-[11px] text-white/70 mt-1 leading-relaxed">
                                    Super Admin is reviewing your closure request. Changed your mind? You can cancel it before approval.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            disabled={cancellingDeletion}
                            onClick={handleCancelDeleteRequest}
                            className="no-dark-override px-4 py-2 rounded-xl bg-amber-400 text-slate-950 text-xs font-bold hover:bg-amber-300 disabled:opacity-50 transition-colors"
                        >
                            {cancellingDeletion ? 'Cancelling...' : 'Cancel Closure Request'}
                        </button>
                    </div>
                )}

                {/* Student Details Card (For Parents & Staff with Linked Children) */}
                {!isAdmin && (user.childName || user.childEprNo) && (
                    <div className="w-full mb-6">
                        <div className="bg-gradient-to-br from-indigo-900/40 to-slate-900/40 border border-indigo-500/20 rounded-2xl p-5 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-colors" />

                            <div className="flex items-start justify-between mb-4 relative z-10">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-300 font-bold text-lg border border-blue-400/30">
                                        <GraduationCap size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-white uppercase tracking-wide">Student Details</h3>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            {(() => {
                                                const isVerified = user.childInAchariya
                                                const s = user.benefitStatus

                                                if (isVerified) {
                                                    return (
                                                        <>
                                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Verified</span>
                                                        </>
                                                    )
                                                }

                                                if (s === 'PendingVerification') {
                                                    return (
                                                        <>
                                                            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Pending Check</span>
                                                        </>
                                                    )
                                                }

                                                return (
                                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 w-full">
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                                                            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">Action Required</span>
                                                        </div>
                                                        <button
                                                            onClick={() => setIsEditingProfile(true)}
                                                            className="no-dark-override no-mobile-btn px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-400 text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/30 transition-all flex items-center gap-1.5"
                                                        >
                                                            <Edit2 size={10} />
                                                            Fix Details
                                                        </button>
                                                    </div>
                                                )
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-y-3 gap-x-2 relative z-10">
                                <div>
                                    <p className="text-[9px] text-white/40 font-bold uppercase tracking-widest mb-0.5">Student Name</p>
                                    <p className="text-sm font-bold text-white tracking-tight truncate">{user.childName || 'Pending...'}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[9px] text-white/40 font-bold uppercase tracking-widest mb-0.5">Grade</p>
                                    <p className="text-sm font-bold text-white tracking-tight">{user.grade || 'N/A'}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] text-white/40 font-bold uppercase tracking-widest mb-0.5">ERP Number</p>
                                    <p className="text-xs font-mono text-indigo-300 font-bold tracking-wider">{user.childEprNo || 'N/A'}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[9px] text-white/40 font-bold uppercase tracking-widest mb-0.5">Campus</p>
                                    <p className="text-xs font-bold text-white tracking-tight truncate">
                                        {user.role === 'Staff'
                                            ? resolvedStaffCampus
                                            : (user.assignedCampus || 'Achariya')
                                        }
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Prompt to Link Child if Missing (Parents & Relevant Staff) */}
                {!isAdmin && ((user.role === 'Parent') || (user.role === 'Staff' && user.childInAchariya)) &&
                    !user.childName && !user.childEprNo && (
                        <button
                            onClick={() => setIsEditingProfile(true)}
                            className="w-full mb-6 group relative overflow-hidden rounded-2xl p-[1px] focus:outline-none"
                        >
                            <span className="absolute inset-0 bg-gradient-to-r from-amber-400/50 via-amber-200/50 to-amber-400/50 opacity-100 animate-gradient-xy transition-opacity" />
                            <div className="relative bg-slate-900 rounded-2xl p-5 flex items-center gap-4 transition-transform group-active:scale-[0.98]">
                                <div className="w-12 h-12 rounded-full bg-amber-400/15 text-amber-300 flex items-center justify-center shrink-0 border border-amber-400/30 group-hover:bg-amber-400 group-hover:text-slate-950 transition-colors">
                                    <Shield size={24} strokeWidth={2.5} />
                                </div>
                                <div className="flex-1 text-left">
                                    <h3 className="text-sm font-black text-amber-300 uppercase tracking-wide group-hover:text-white transition-colors">Link Child Details</h3>
                                    <p className="text-[10px] text-white/50 font-medium leading-tight mt-0.5">
                                        Claim your <strong>School Fee Discount</strong> by linking your child&apos;s ERP details.
                                    </p>
                                </div>
                                <ChevronRight size={18} className="text-amber-400/50 group-hover:text-white transition-colors" />
                            </div>
                        </button>
                    )}

                {/* Edit Form or Menu List */}
                <div className="space-y-4">
                    {isEditingProfile ? (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                            <div className={`${formSurface} rounded-2xl p-6 space-y-4`}>
                                <div className="flex items-center justify-between">
                                    <h3 className={`text-sm font-bold uppercase tracking-wide ${isLight ? 'text-slate-700' : 'text-white/70'}`}>Edit Personal Details</h3>
                                    <button
                                        onClick={handleCancel}
                                        className={`no-mobile-btn p-2 rounded-full transition-colors ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-white/5 hover:bg-white/10 text-white/60'}`}
                                    >
                                        <X size={14} />
                                    </button>
                                </div>

                                <div className="space-y-1.5">
                                    <label className={`text-xs font-bold ml-1 ${subLabelText}`}>Full Name</label>
                                    <input
                                        type="text"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        className={inputClasses}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className={`text-xs font-bold ml-1 ${subLabelText}`}>Email</label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="Add email address"
                                        className={inputClasses}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className={`text-xs font-bold ml-1 ${subLabelText}`}>Address</label>
                                    <textarea
                                        value={address}
                                        onChange={(e) => setAddress(e.target.value)}
                                        placeholder="Add your address"
                                        rows={3}
                                        className={`${inputClasses} resize-none`}
                                    />
                                </div>

                                {/* Child Details Section for Staff (with child opt-in) & Parents */}
                                {!isAdmin && ((user.role === 'Staff' && user.childInAchariya) || user.role === 'Parent') && (
                                    <div className="pt-4 border-t border-white/10 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wide">Child Details (Achariya)</h3>
                                            {user.childInAchariya && (
                                                <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                                                    <Lock size={10} className="text-emerald-400" />
                                                    <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">Verified &amp; Locked</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-white/40 ml-1">Child ERP No</label>
                                            <input
                                                type="text"
                                                value={childEprNo}
                                                onChange={(e) => setChildEprNo(e.target.value)}
                                                placeholder="Enter ERP Number"
                                                disabled={user.childInAchariya}
                                                className={`w-full bg-black/20 border rounded-xl px-4 py-3 text-white transition-colors focus:outline-none ${user.childInAchariya ? 'border-transparent opacity-50 cursor-not-allowed' : 'border-white/10 focus:border-amber-500/50'}`}
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-white/40 ml-1">Child Name</label>
                                            <input
                                                type="text"
                                                value={childName}
                                                onChange={(e) => setChildName(e.target.value)}
                                                placeholder="Enter Child Name"
                                                disabled={user.childInAchariya}
                                                className={`w-full bg-black/20 border rounded-xl px-4 py-3 text-white transition-colors focus:outline-none ${user.childInAchariya ? 'border-transparent opacity-50 cursor-not-allowed' : 'border-white/10 focus:border-amber-500/50'}`}
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-white/40 ml-1">Campus</label>
                                            <select
                                                value={childCampusId}
                                                onChange={(e) => {
                                                    setChildCampusId(e.target.value)
                                                    setGrade('')
                                                }}
                                                disabled={user.childInAchariya}
                                                className={`w-full bg-black/20 border rounded-xl px-4 py-3 text-white transition-colors appearance-none ${user.childInAchariya ? 'border-transparent opacity-50 cursor-not-allowed' : 'border-white/10 focus:border-amber-500/50 cursor-pointer'}`}
                                            >
                                                <option value="" className="bg-slate-900 text-white/50">Select Campus</option>
                                                {campuses.map(c => (
                                                    <option key={c.id} value={c.id} className="bg-slate-900 text-white">{c.campusName}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-white/40 ml-1">Grade</label>
                                            <select
                                                value={grade}
                                                onChange={(e) => setGrade(e.target.value)}
                                                disabled={user.childInAchariya || !childCampusId}
                                                className={`w-full bg-black/20 border rounded-xl px-4 py-3 text-white transition-colors appearance-none ${user.childInAchariya || !childCampusId ? 'border-transparent opacity-50 cursor-not-allowed' : 'border-white/10 focus:border-amber-500/50 cursor-pointer'}`}
                                            >
                                                <option value="" className="bg-slate-900 text-white/50">
                                                    {!childCampusId ? 'Select Campus First' : 'Select Grade'}
                                                </option>
                                                {(() => {
                                                    const supportedGrades = getGradesForCampus(childCampusId, campuses)
                                                    if (supportedGrades.length === 0) {
                                                        return (GRADES as readonly string[]).map(g => (
                                                            <option key={g} value={g} className="bg-slate-900 text-white">{g}</option>
                                                        ))
                                                    }
                                                    return supportedGrades.map(g => (
                                                        <option key={g} value={g} className="bg-slate-900 text-white">{g}</option>
                                                    ))
                                                })()}
                                            </select>
                                        </div>

                                        {!user.childInAchariya ? (
                                            <p className="text-[9px] text-amber-200/60 ml-1 flex items-center gap-1.5 bg-amber-500/5 p-2 rounded-lg border border-amber-500/10">
                                                <Shield size={10} />
                                                Updating these details will reset your benefit status to <strong>Pending Verification</strong> until approved by Admin.
                                            </p>
                                        ) : (
                                            <p className="text-[9px] text-emerald-200/60 ml-1 flex items-center gap-1.5 bg-emerald-500/5 p-2 rounded-lg border border-emerald-500/10">
                                                <Shield size={10} />
                                                These details are verified. Contact Admin to request changes.
                                            </p>
                                        )}
                                    </div>
                                )}

                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="no-dark-override w-full py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold uppercase tracking-widest shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 mt-4 transition-all disabled:opacity-60"
                                >
                                    {saving ? 'Saving...' : 'Save Changes'}
                                    {!saving && <Check size={18} />}
                                </button>
                            </div>
                        </div>
                    ) : isEditingBank && !isAdmin ? (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wide">Edit Bank Details</h3>
                                    <button onClick={handleCancel} className="no-mobile-btn p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
                                        <X size={14} className="text-white/60" />
                                    </button>
                                </div>

                                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-3">
                                    <Shield size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                                    <p className="text-[10px] text-emerald-200/80 leading-relaxed">
                                        Used securely for reward and refund payout processing.
                                    </p>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-white/40 ml-1">Bank Name</label>
                                    <input
                                        type="text"
                                        value={bankName}
                                        onChange={(e) => setBankName(e.target.value)}
                                        placeholder="e.g. HDFC Bank"
                                        className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-amber-500/50 focus:outline-none transition-colors"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-white/40 ml-1">Account Number</label>
                                    <input
                                        type="text"
                                        value={accountNumber}
                                        onChange={(e) => setAccountNumber(e.target.value)}
                                        placeholder="Enter Account No."
                                        className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-amber-500/50 focus:outline-none transition-colors"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-white/40 ml-1">IFSC Code</label>
                                    <input
                                        type="text"
                                        value={ifscCode}
                                        onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                                        placeholder="e.g. HDFC0001234"
                                        className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-amber-500/50 focus:outline-none transition-colors uppercase"
                                    />
                                </div>

                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="no-dark-override w-full py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold uppercase tracking-widest shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 mt-4 transition-all disabled:opacity-60"
                                >
                                    {saving ? 'Saving...' : 'Update Bank Details'}
                                    {!saving && <Check size={18} />}
                                </button>
                            </div>
                        </div>
                    ) : isChangingPassword ? (
                        <form onSubmit={handlePasswordSubmit} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                            <div className={`${formSurface} rounded-2xl p-6 space-y-4`}>
                                <div className="flex items-center justify-between">
                                    <h3 className={`text-sm font-bold uppercase tracking-wide ${isLight ? 'text-blue-700' : 'text-blue-300'}`}>Change Password</h3>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsChangingPassword(false)
                                            setCurrentPassword('')
                                            setNewPassword('')
                                            setConfirmPassword('')
                                        }}
                                        className={`no-mobile-btn p-2 rounded-full transition-colors ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-white/5 hover:bg-white/10 text-white/60'}`}
                                    >
                                        <X size={14} />
                                    </button>
                                </div>

                                <div className="space-y-1.5">
                                    <label className={`text-xs font-bold ml-1 ${subLabelText}`}>Current Password</label>
                                    <input
                                        type={showPasswords ? 'text' : 'password'}
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        placeholder="Enter current password"
                                        required
                                        className={inputClasses}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className={`text-xs font-bold ml-1 ${subLabelText}`}>New Password</label>
                                    <input
                                        type={showPasswords ? 'text' : 'password'}
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="Min 8 chars, 1 upper, 1 number, 1 symbol"
                                        required
                                        className={inputClasses}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className={`text-xs font-bold ml-1 ${subLabelText}`}>Confirm New Password</label>
                                    <input
                                        type={showPasswords ? 'text' : 'password'}
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="Re-enter new password"
                                        required
                                        className={inputClasses}
                                    />
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setShowPasswords(v => !v)}
                                    className={`no-mobile-btn text-[11px] font-bold flex items-center gap-1.5 ${isLight ? 'text-slate-600 hover:text-slate-900' : 'text-white/60 hover:text-white'}`}
                                >
                                    {showPasswords ? <EyeOff size={13} /> : <Eye size={13} />}
                                    {showPasswords ? 'Hide passwords' : 'Show passwords'}
                                </button>

                                <button
                                    type="submit"
                                    disabled={savingPassword}
                                    className="no-dark-override w-full py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold uppercase tracking-widest shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 mt-2 disabled:opacity-60 transition-all"
                                >
                                    {savingPassword ? 'Updating...' : 'Update Password'}
                                    {!savingPassword && <Check size={18} />}
                                </button>
                            </div>
                        </form>
                    ) : (
                        /* READ ONLY MODE */
                        <>
                            <div className="flex flex-col gap-3">
                                <div className={`${cardSurface} rounded-2xl p-4 flex items-center gap-4 transition-all group`}>
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform ${isLight ? 'bg-blue-50 text-blue-600' : 'bg-blue-500/15 text-blue-400'}`}>
                                        <Phone size={18} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-[10px] font-black uppercase tracking-widest mb-0.5 ${subLabelText}`}>Mobile</p>
                                        <p className={`text-sm font-bold tracking-tight ${headingText}`}>{user.mobileNumber || user.adminMobile || 'N/A'}</p>
                                    </div>
                                </div>

                                <div className={`${cardSurface} rounded-2xl p-4 flex items-center gap-4 transition-all group`}>
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform ${isLight ? 'bg-purple-50 text-purple-600' : 'bg-purple-500/15 text-purple-400'}`}>
                                        <Mail size={18} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-[10px] font-black uppercase tracking-widest mb-0.5 ${subLabelText}`}>Email</p>
                                        <p className={`text-sm font-bold tracking-tight truncate ${headingText}`}>{email || 'Not provided'}</p>
                                    </div>
                                </div>

                                <div className={`${cardSurface} rounded-2xl p-4 flex items-center gap-4 transition-all group`}>
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform ${isLight ? 'bg-pink-50 text-pink-600' : 'bg-pink-500/15 text-pink-400'}`}>
                                        <MapPin size={18} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-[10px] font-black uppercase tracking-widest mb-0.5 ${subLabelText}`}>Location</p>
                                        <p className={`text-sm font-bold tracking-tight truncate ${headingText}`}>{address || 'No address set'}</p>
                                    </div>
                                </div>

                                {/* Bank Details Read-Only Card (Masked Account Number, Ambassadors only) */}
                                {!isAdmin && (
                                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4 hover:bg-white/10 transition-colors group relative">
                                        <div className="w-10 h-10 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <CreditCard size={18} />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                                <p className="text-[10px] text-white/40 font-black uppercase tracking-widest mb-0.5">Bank Details</p>
                                                <div className="flex items-center gap-1.5">
                                                    {accountNumber && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowAccountNumber(v => !v)}
                                                            className="no-mobile-btn p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                                                            title={showAccountNumber ? 'Hide Account Number' : 'Show Account Number'}
                                                            aria-label={showAccountNumber ? 'Hide Account Number' : 'Show Account Number'}
                                                        >
                                                            {showAccountNumber ? <EyeOff size={12} /> : <Eye size={12} />}
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsEditingBank(true)}
                                                        className="no-mobile-btn p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/40 hover:text-emerald-400 transition-colors"
                                                        title="Edit Bank Details"
                                                        aria-label="Edit Bank Details"
                                                    >
                                                        <Edit2 size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                            {bankName || accountNumber ? (
                                                <div className="text-xs text-white/80 font-mono tracking-tight">
                                                    <p>{bankName}</p>
                                                    <p>{accountNumber ? (showAccountNumber ? accountNumber : maskAccountNumber(accountNumber)) : ''}</p>
                                                    <p className="text-white/40 text-[10px]">{ifscCode}</p>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-between">
                                                    <p className="text-sm font-bold text-white/50 tracking-tight">Not Provided</p>
                                                    <button
                                                        onClick={() => setIsEditingBank(true)}
                                                        className="no-mobile-btn text-[10px] font-bold text-emerald-400 uppercase tracking-wider hover:underline"
                                                    >
                                                        Add Now
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Account, Security & Data Controls (Option A — No prominent red Delete button) */}
                            <div className="space-y-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsChangingPassword(true)}
                                    className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all group active:scale-[0.98] ${actionSurface}`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform ${isLight ? 'bg-sky-50 text-sky-600' : 'bg-sky-500/15 text-sky-400'}`}>
                                            <KeyRound size={18} />
                                        </div>
                                        <div className="text-left">
                                            <h3 className={`font-bold text-sm ${headingText}`}>Change Password</h3>
                                            <p className={`text-[10px] uppercase tracking-widest ${subLabelText}`}>Update login credentials</p>
                                        </div>
                                    </div>
                                    <ChevronRight size={18} className={`transition-colors ${chevronText}`} />
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setShowPrivacyModal(true)}
                                    className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all group active:scale-[0.98] ${actionSurface}`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform ${isLight ? 'bg-amber-50 text-amber-600' : 'bg-amber-500/15 text-amber-400'}`}>
                                            <Shield size={18} />
                                        </div>
                                        <div className="text-left">
                                            <h3 className={`font-bold text-sm ${headingText}`}>Privacy &amp; Data Controls</h3>
                                            <p className={`text-[10px] uppercase tracking-widest ${subLabelText}`}>Policies, data rights &amp; closure</p>
                                        </div>
                                    </div>
                                    <ChevronRight size={18} className={`transition-colors ${chevronText}`} />
                                </button>

                                <button
                                    type="button"
                                    onClick={() => router.push(isAdmin ? '/tickets' : '/support')}
                                    className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all group active:scale-[0.98] ${actionSurface}`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform ${isLight ? 'bg-indigo-50 text-indigo-600' : 'bg-indigo-500/15 text-indigo-400'}`}>
                                            <HelpCircle size={18} />
                                        </div>
                                        <div className="text-left">
                                            <h3 className={`font-bold text-sm ${headingText}`}>Help &amp; Support</h3>
                                            <p className={`text-[10px] uppercase tracking-widest ${subLabelText}`}>Get assistance or raise a ticket</p>
                                        </div>
                                    </div>
                                    <ChevronRight size={18} className={`transition-colors ${chevronText}`} />
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* App Download / PWA Section (Ambassadors on Web/PWA only — hidden for Admins and inside APK) */}
                {!isAdmin && !isNativeApp && (
                    <div className="pt-8 space-y-4">
                        <div className="bg-gradient-to-br from-blue-600/20 to-indigo-600/20 backdrop-blur-xl border border-blue-500/20 rounded-3xl p-6 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-blue-500/20 transition-colors" />

                            <div className="flex items-start gap-4 mb-6">
                                <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                                    <Smartphone size={24} />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-sm font-black text-white uppercase tracking-tight mb-1">Achariya Mobile App</h3>
                                    <p className="text-[10px] text-white/50 leading-relaxed font-medium">
                                        Install our official app for a faster experience, offline access, and instant notifications.
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={() => {
                                    window.dispatchEvent(new CustomEvent('trigger-PWA-install'))
                                    toast.info('App Installation Guide Opened', {
                                        description: 'Follow the steps in the guide to install the app on your home screen.'
                                    })
                                }}
                                className="no-dark-override w-full bg-blue-600 hover:bg-blue-500 text-white h-12 rounded-xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
                            >
                                <Download size={16} />
                                Download App
                            </button>
                        </div>
                    </div>
                )}

                {/* Sign Out */}
                <div className="pt-8 pb-4">
                    <button
                        onClick={handleSignOut}
                        className={`w-full h-14 rounded-2xl border flex items-center justify-center gap-2 font-bold transition-all active:scale-95 text-xs uppercase tracking-widest ${
                            isLight
                                ? 'bg-white border-slate-200 text-slate-700 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 shadow-sm'
                                : 'border-white/10 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white'
                        }`}
                    >
                        <LogOut size={16} />
                        Sign Out
                    </button>
                    <p className={`text-center text-[10px] mt-6 uppercase tracking-widest ${isLight ? 'text-slate-400' : 'text-white/30'}`}>
                        Achariya Partnership Program
                    </p>
                </div>
            </PageAnimate>

            <PrivacyModal
                isOpen={showPrivacyModal}
                onClose={() => setShowPrivacyModal(false)}
                canRequestDeletion={!isAdmin}
                isDeletionRequested={accountStatus === 'Deletion_Requested'}
                referralCount={referralCount}
                securedValue={user.securedValue || 0}
                onRequestDeletion={handleDeleteRequest}
                onCancelDeletion={handleCancelDeleteRequest}
                onSignOut={handleSignOut}
                onContactSupport={() => router.push(isAdmin ? '/tickets' : '/support')}
            />
        </div>
    )
}
