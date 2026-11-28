import { NextResponse } from 'next/server';

const ALLOWED_VITALS = new Set(['CLS', 'FCP', 'FID', 'INP', 'LCP', 'TTFB']);

/**
 * API endpoint to collect Web Vitals metrics
 * Called automatically by reportWebVitals in production
 */
export async function POST(request: Request) {
    try {
        const metric = await request.json();

        if (
            !metric ||
            typeof metric.name !== 'string' ||
            !ALLOWED_VITALS.has(metric.name) ||
            typeof metric.value !== 'number' ||
            !Number.isFinite(metric.value)
        ) {
            return NextResponse.json({ error: 'Invalid metric payload' }, { status: 400 });
        }

        const safeRating =
            typeof metric.rating === 'string' && metric.rating.length <= 32 ? metric.rating : 'unknown';
        const safeId =
            typeof metric.id === 'string' && metric.id.length <= 128 ? metric.id : 'unknown';

        // Log metric (in production, send to analytics service)
        console.log('Web Vital:', {
            name: metric.name,
            value: metric.value,
            rating: safeRating,
            id: safeId,
            timestamp: new Date().toISOString(),
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error logging web vital:', error);
        return NextResponse.json({ error: 'Failed to log metric' }, { status: 400 });
    }
}
