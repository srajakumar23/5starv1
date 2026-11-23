import 'dotenv/config'
import prisma from '../lib/prisma'
import { ensureUserReferralCode } from '../lib/referral-service'

/**
 * One-time surgical backfill for Active users who are missing a Partner ID (referralCode).
 * Strictly leaves Pending/Inactive/Deleted users untouched.
 *
 * Usage:
 *   npx tsx src/scripts/backfill-active-missing-partner-ids.ts --dry-run
 *   npx tsx src/scripts/backfill-active-missing-partner-ids.ts
 */
async function main() {
    const isDryRun = process.argv.includes('--dry-run')
    console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be written)' : 'LIVE BACKFILL'}`)

    const targets = await prisma.user.findMany({
        where: {
            status: 'Active',
            OR: [{ referralCode: null }, { referralCode: '' }]
        },
        orderBy: { userId: 'asc' },
        select: {
            userId: true,
            fullName: true,
            mobileNumber: true,
            role: true,
            paymentStatus: true
        }
    })

    console.log(`Found ${targets.length} Active user(s) missing Partner ID:`)
    for (const u of targets) {
        console.log(`  - userId=${u.userId} | ${u.fullName} | ${u.mobileNumber} | role=${u.role} | paymentStatus=${u.paymentStatus}`)
    }

    if (isDryRun || targets.length === 0) {
        console.log(isDryRun ? 'Dry run complete. Exiting without writes.' : 'Nothing to backfill.')
        return
    }

    console.log('\nAssigning Partner IDs sequentially...')
    console.log('userId | fullName | mobileNumber | assignedReferralCode')
    console.log('-------|----------|--------------|---------------------')

    for (const u of targets) {
        const assignedCode = await ensureUserReferralCode(u.userId, u.role)
        if (!assignedCode) {
            throw new Error(`Failed to assign Partner ID for userId ${u.userId}`)
        }

        await prisma.activityLog.create({
            data: {
                action: 'UPDATE',
                module: 'user',
                targetId: String(u.userId),
                description: `Backfilled missing Partner ID ${assignedCode} for Active user ${u.fullName}`,
                metadata: {
                    userId: u.userId,
                    mobileNumber: u.mobileNumber,
                    role: u.role,
                    assignedReferralCode: assignedCode,
                    reason: 'backfill-active-missing-partner-ids'
                }
            }
        })

        console.log(`${u.userId} | ${u.fullName} | ${u.mobileNumber} | ${assignedCode}`)
    }

    console.log(`\nBackfill completed for ${targets.length} user(s).`)
}

main()
    .catch((e) => {
        console.error('Backfill failed:', e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
