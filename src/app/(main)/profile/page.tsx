import { getCurrentUser } from '@/lib/auth-service'
import { redirect } from 'next/navigation'
import ProfileClient from './profile-client'
import { decrypt } from '@/lib/encryption'
import { deleteSession } from '@/lib/session'

async function logout() {
    'use server'
    try {
        await deleteSession()
        return { success: true }
    } catch (error) {
        console.error('Logout error:', error)
        return { success: false, error: 'Failed to clear session' }
    }
}



export default async function ProfilePage() {
    const user = await getCurrentUser()
    if (!user) redirect('/')

    // Serialize user data for client component
    // IMPORTANT: Admin objects also expose `userId: admin.adminId`, so check `adminId` first!
    const isAdmin = 'adminId' in user && Boolean((user as any).adminId)
    const isUser = !isAdmin && 'userId' in user

    // Decrypt sensitive data if present
    const bankDetails = isUser && (user as any).bankAccountDetails ? decrypt((user as any).bankAccountDetails) : undefined
    const aadhar = isUser && (user as any).aadharNo ? decrypt((user as any).aadharNo) : undefined

    // Fetch Referrals for Benefit Calculation (Ambassadors only)
    let projectedValue = 0
    let securedValue = 0
    let confirmedCount = 0

    if (isUser) {
        const userId = (user as any).userId
        const { getUserRevenueStats } = await import('@/lib/revenue-service')

        const stats = await getUserRevenueStats(userId, user.role, {
            childInAchariya: (user as any).childInAchariya,
            studentFee: (user as any).studentFee || 0,
            isFiveStarMember: (user as any).isFiveStarMember
        })

        projectedValue = stats.projectedValue
        securedValue = stats.securedValue
        confirmedCount = stats.confirmedCount
    }

    const userData = {
        isAdmin,
        userId: isUser ? user.userId : undefined,
        adminId: isAdmin ? (user as any).adminId : undefined,
        fullName: user.fullName,
        mobileNumber: isUser && 'mobileNumber' in user ? user.mobileNumber : undefined,
        adminMobile: isAdmin ? ((user as any).adminMobile || user.mobileNumber) : undefined,
        role: user.role,
        referralCode: isUser && 'referralCode' in user ? (user.referralCode ?? undefined) : undefined,
        assignedCampus: 'assignedCampus' in user ? (user.assignedCampus ?? undefined) : undefined,
        yearFeeBenefitPercent: isUser && 'yearFeeBenefitPercent' in user ? user.yearFeeBenefitPercent : undefined,
        longTermBenefitPercent: isUser && 'longTermBenefitPercent' in user ? user.longTermBenefitPercent : undefined,
        email: 'email' in user ? ((user as any).email ?? undefined) : undefined,
        address: 'address' in user ? ((user as any).address ?? undefined) : undefined,
        profileImage: 'profileImage' in user ? ((user as any).profileImage ?? undefined) : undefined,
        createdAt: 'createdAt' in user && (user as any).createdAt ? new Date((user as any).createdAt).toISOString() : new Date().toISOString(),
        confirmedReferralCount: confirmedCount,
        studentFee: isUser ? (user as any).studentFee : undefined,
        projectedValue: projectedValue,
        securedValue: securedValue,
        // New Registration Fields
        bankAccountDetails: bankDetails, // Legacy
        bankName: isUser ? (user as any).bankName : undefined,
        accountNumber: isUser ? (user as any).accountNumber : undefined,
        ifscCode: isUser ? (user as any).ifscCode : undefined,

        childName: isUser ? (user as any).childName : undefined,
        grade: isUser ? (user as any).grade : undefined,
        childEprNo: isUser ? (user as any).childEprNo : undefined,
        childCampusId: isUser ? (user as any).childCampusId : undefined,
        empId: isUser ? (user as any).empId : undefined,
        childInAchariya: isUser ? (user as any).childInAchariya : false,
        aadharNo: aadhar,
        transactionId: isUser ? (user as any).transactionId : undefined,
        status: isUser ? (user as any).status : (user as any).status,
        benefitStatus: isUser ? (user as any).benefitStatus : undefined
    }

    return <ProfileClient user={userData} logoutAction={logout} />
}
