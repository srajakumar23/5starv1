
import { NextResponse } from 'next/server'
import { automationEngine } from '@/lib/automation-engine'
import { verifyBearerSecret } from '@/lib/webhook-auth'

// This route should be called by a cron job (e.g. Vercel Cron)
// Secure it with CRON_SECRET fail-closed
export async function GET(request: Request) {
    try {
        if (!verifyBearerSecret(request, process.env.CRON_SECRET)) {
            return new NextResponse('Unauthorized', { status: 401 })
        }

        // Run dynamic Smart Rules Engine exclusively so UI rule activation/deactivation is 100% respected
        const smartEngineResult = await automationEngine.runCronRules()

        return NextResponse.json({
            success: true,
            summary: {
                smartSystem: smartEngineResult
            }
        })
    } catch (error: any) {
        console.error('Reminder Cron Job Failed:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
