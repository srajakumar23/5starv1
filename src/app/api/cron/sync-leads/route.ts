import { runSyncProgramLeads } from '@/lib/program-sync-service'
import { verifyBearerSecret } from '@/lib/webhook-auth'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        if (!verifyBearerSecret(request, process.env.CRON_SECRET)) {
            return new NextResponse('Unauthorized', { status: 401 })
        }

        const result = await runSyncProgramLeads()
        return NextResponse.json(result)
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
    }
}
