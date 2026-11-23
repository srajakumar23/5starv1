import prisma from '@/lib/prisma'

/**
 * Generates a structured referral code based on the user's role.
 * Format: ACH25-[ROLE_PREFIX][SEQUENCE_NUMBER]
 * 
 * Prefixes:
 * - Parent: P
 * - Staff: S
 * - Alumni: A
 * - Default: M (Member)
 * 
 * @param role - The user's role (e.g., 'Parent', 'Staff', 'Alumni')
 * @returns A string like 'ACH25-P00042'
 */
export async function generateSmartReferralCode(role: string, academicYear?: string, offset: number = 0): Promise<string> {
    const normalizedRole = role.toUpperCase()
    let rolePrefix = 'M' // Default for general members

    if (normalizedRole.includes('PARENT')) rolePrefix = 'P'
    else if (normalizedRole.includes('STAFF')) rolePrefix = 'S'
    else if (normalizedRole.includes('ALUMNI')) rolePrefix = 'A'
    else if (normalizedRole.includes('OTHERS')) rolePrefix = 'O'

    const yearSuffix = new Date().getFullYear().toString().slice(-2)
    const basePrefix = `ACH${yearSuffix}-${rolePrefix}`

    // Find the latest user with this prefix to determine the next number
    const lastUser = await prisma.user.findFirst({
        where: {
            referralCode: {
                startsWith: basePrefix
            }
        },
        orderBy: {
            referralCode: 'desc'
        },
        select: {
            referralCode: true
        }
    })

    let nextNumber = 1

    if (lastUser && lastUser.referralCode) {
        // Extract the number part: ACH25-P00042 -> 42
        const parts = lastUser.referralCode.split(rolePrefix)
        const lastNumStr = parts[parts.length - 1] // Get the last part
        const lastNum = parseInt(lastNumStr, 10)

        if (!isNaN(lastNum)) {
            nextNumber = lastNum + 1
        }
    }

    // Add offset for retries
    nextNumber += offset

    const sequenceNumber = nextNumber.toString().padStart(5, '0')
    return `${basePrefix}${sequenceNumber}`
}

/**
 * Ensures an Active/upgraded user has a non-empty referralCode (Partner ID).
 * Strictly idempotent: never overwrites an existing referralCode.
 * Retries sequentially on Prisma P2002 unique constraint collisions.
 */
export async function ensureUserReferralCode(userId: number, roleHint?: string): Promise<string | null> {
    const existing = await prisma.user.findUnique({
        where: { userId },
        select: { referralCode: true, role: true }
    })

    if (!existing) return null
    if (existing.referralCode && existing.referralCode.trim() !== '') {
        return existing.referralCode
    }

    const role = roleHint || existing.role || 'Parent'
    const MAX_RETRIES = 5

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const candidateCode = await generateSmartReferralCode(role, undefined, attempt)
        try {
            const result = await prisma.user.updateMany({
                where: {
                    userId,
                    OR: [{ referralCode: null }, { referralCode: '' }]
                },
                data: { referralCode: candidateCode }
            })
            if (result.count > 0) return candidateCode

            const refreshed = await prisma.user.findUnique({
                where: { userId },
                select: { referralCode: true }
            })
            return refreshed?.referralCode || null
        } catch (err: any) {
            if (err?.code === 'P2002') continue
            throw err
        }
    }

    throw new Error(`Failed to assign unique referralCode for userId ${userId} after ${MAX_RETRIES} attempts`)
}
