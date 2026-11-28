import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET() {
  const result = {
    status: 'unhealthy' as 'healthy' | 'unhealthy',
    timestamp: new Date().toISOString(),
    database: {
      reachable: false,
      configured: Boolean(process.env.DATABASE_URL),
    },
  }

  try {
    await prisma.$queryRaw`SELECT 1`
    result.status = 'healthy'
    result.database.reachable = true
  } catch (error) {
    console.error('[HealthCheck] Database connectivity check failed')
  }

  return NextResponse.json(result)
}
