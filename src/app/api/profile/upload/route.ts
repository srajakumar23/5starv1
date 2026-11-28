import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import prisma from '@/lib/prisma'
import { isR2Configured, uploadDataUrlToR2 } from '@/lib/r2'

export async function POST(request: Request) {
    try {
        const session = await getSession()

        if (!session || !session.userId) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
        }

        const userId = Number(session.userId)
        const userType = session.userType as 'user' | 'admin'
        const { image } = await request.json()

        if (!image || typeof image !== 'string') {
            return NextResponse.json({ error: 'No image provided' }, { status: 400 })
        }

        if (!/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(image)) {
            return NextResponse.json({ error: 'Invalid image format. Allowed: JPEG, PNG, WebP, GIF.' }, { status: 400 })
        }

        // Guard against raw multi-MB Base64 payloads
        if (image.length > 2_000_000) {
            return NextResponse.json({ error: 'Image is too large. Please choose a smaller photo.' }, { status: 400 })
        }

        // Store in Cloudflare R2 when configured, with automatic Base64 fallback so uploads never fail
        let storedValue = image
        let storage: 'r2' | 'inline' = 'inline'

        if (isR2Configured()) {
            try {
                const uploaded = await uploadDataUrlToR2(image, `${userType}-${userId}`)
                storedValue = uploaded.publicUrl
                storage = 'r2'
            } catch (r2Error) {
                console.error('R2 upload failed, falling back to inline storage:', r2Error)
            }
        }

        // Update based on user type
        if (userType === 'admin') {
            await prisma.admin.update({
                where: { adminId: userId },
                data: { profileImage: storedValue }
            })
        } else {
            await prisma.user.update({
                where: { userId: userId },
                data: { profileImage: storedValue }
            })
        }

        return NextResponse.json({ success: true, profileImage: storedValue, storage })
    } catch (error) {
        console.error('Profile photo upload error:', error)
        return NextResponse.json({ error: 'Failed to upload photo' }, { status: 500 })
    }
}
