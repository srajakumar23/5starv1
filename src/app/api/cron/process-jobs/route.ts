import { NextResponse, after } from 'next/server'
import prisma from '@/lib/prisma'
import { dispatchCampaignBatch } from '@/app/campaign-dispatcher'
import { verifyBearerSecret } from '@/lib/webhook-auth'
import { executeReengagementLogic, executeCampusEnforcementLogic } from '@/lib/background-jobs-service'

export const dynamic = 'force-dynamic' // Ensure this route is never cached
export const maxDuration = 60 // Allow longer execution time if possible (Vercel specific)

export async function GET(request: Request) {
    if (!verifyBearerSecret(request, process.env.CRON_SECRET)) {
        return new NextResponse('Unauthorized', { status: 401 })
    }

    // 1. Fetch available job
    // We use a transaction or simple update to "lock" the job
    // Ideally: UPDATE Job SET status='PROCESSING' WHERE id = (SELECT id FROM Job WHERE status='PENDING' ORDER BY createdAt LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *
    // But Prisma doesn't support "SKIP LOCKED" easily without raw SQL.
    // For simplicity/low-concurrency, we'll just findFirst then update.

    try {
        // 0. Recover any stale job stuck in PROCESSING for > 10 minutes
        const staleThreshold = new Date(Date.now() - 10 * 60 * 1000)
        await prisma.job.updateMany({
            where: {
                status: 'PROCESSING',
                updatedAt: { lt: staleThreshold }
            },
            data: {
                status: 'PENDING',
                error: 'Recovered from stale PROCESSING lock'
            }
        }).catch(() => null)

        // 1. Fetch and Lock the oldest PENDING job atomically
        const jobToProcess = await prisma.job.findFirst({
            where: { status: 'PENDING' },
            orderBy: { createdAt: 'asc' },
            select: { id: true }
        })

        if (!jobToProcess) {
            return NextResponse.json({ success: true, message: 'No jobs pending' })
        }

        // Atomic conditional claim using updateMany so concurrent workers fail gracefully instead of throwing P2025
        const lockResult = await prisma.job.updateMany({
            where: {
                id: jobToProcess.id,
                status: 'PENDING'
            },
            data: { status: 'PROCESSING' }
        })

        if (lockResult.count === 0) {
            return NextResponse.json({ success: true, message: 'Job already claimed by another worker' })
        }

        const job = await prisma.job.findUnique({ where: { id: jobToProcess.id } })
        if (!job) {
            return NextResponse.json({ success: true, message: 'Job not found' })
        }

        console.log(`[JobProcessor] Locked Job #${job.id} Type: ${job.type} at ${new Date().toISOString()}`)

        // 2. Execute Logic based on Type
        if (job.type === 'CAMPAIGN_BATCH') {
            const { campaignId } = job.payload as any

            // Run the dispatcher
            const result = (await dispatchCampaignBatch(campaignId)) as any

            if (result.success) {
                // If the dispatcher signaled there's more work (batch limit reached),
                // set back to PENDING so it can be picked up again.
                // Otherwise mark as COMPLETED.
                await prisma.job.update({
                    where: { id: job.id },
                    data: { status: result.hasMore ? 'PENDING' : 'COMPLETED' }
                })
            } else {
                await prisma.job.update({
                    where: { id: job.id },
                    data: {
                        status: 'FAILED',
                        error: result.error || 'Unknown error'
                    }
                })
            }
        } else if (job.type === 'SYSTEM_REENGAGEMENT') {
            try {
                const count = await executeReengagementLogic()
                await prisma.job.update({
                    where: { id: job.id },
                    data: { status: 'COMPLETED' }
                })
            } catch (err: any) {
                await prisma.job.update({
                    where: { id: job.id },
                    data: { status: 'FAILED', error: err.message || 'Re-engagement failed' }
                })
            }
        } else if (job.type === 'SYSTEM_ENFORCEMENT') {
            try {
                const result = await executeCampusEnforcementLogic()
                await prisma.job.update({
                    where: { id: job.id },
                    data: { status: 'COMPLETED' }
                })
            } catch (err: any) {
                await prisma.job.update({
                    where: { id: job.id },
                    data: { status: 'FAILED', error: err.message || 'Enforcement failed' }
                })
            }
        } else {
            // Unknown job type
            await prisma.job.update({
                where: { id: job.id },
                data: { status: 'FAILED', error: 'Unknown job type' }
            })
        }

        // 3. Recursive Call?
        // If there are more jobs, trigger ourselves again to process sequentially
        const nextJob = await prisma.job.findFirst({
            where: { status: 'PENDING' },
            select: { id: true }
        })

        if (nextJob) {
            let baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL
            if (!baseUrl && process.env.VERCEL_URL) {
                baseUrl = `https://${process.env.VERCEL_URL}`
            }
            if (!baseUrl && process.env.NODE_ENV === 'development') {
                baseUrl = 'http://localhost:3001' // Default to our dev port
            } else if (!baseUrl) {
                baseUrl = 'http://localhost:3000'
            }

            // Schedule next batch via Next.js after() so serverless execution completes dispatch reliably
            const targetUrl = `${baseUrl}/api/cron/process-jobs`
            const cronSecret = process.env.CRON_SECRET
            after(async () => {
                const controller = new AbortController()
                const timeoutId = setTimeout(() => controller.abort(), 10000)
                try {
                    await fetch(targetUrl, {
                        method: 'GET',
                        cache: 'no-store',
                        signal: controller.signal,
                        headers: cronSecret
                            ? { authorization: `Bearer ${cronSecret}` }
                            : undefined
                    })
                } catch (err) {
                    console.error('[JobProcessor] Failed to trigger next job', err)
                } finally {
                    clearTimeout(timeoutId)
                }
            })
        }

        return NextResponse.json({ success: true, jobId: job.id, nextPending: !!nextJob })

    } catch (error: any) {
        console.error('[JobProcessor] Error:', error)
        return NextResponse.json({ success: false, error: 'Job processing failed' }, { status: 500 })
    }
}
