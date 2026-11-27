import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import prisma from '@/lib/prisma'

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

        // Guard against raw multi-MB Base64 payloads bloating Postgres TOAST storage
        if (image.length > 2_000_000) {
            return NextResponse.json({ error: 'Image is too large. Please choose a smaller photo.' }, { status: 400 })
        }

        // Update based on user type
        if (userType === 'admin') {
            await prisma.admin.update({
                where: { adminId: userId },
                data: { profileImage: image }
            })
        } else {
            await prisma.user.update({
                where: { userId: userId },
                data: { profileImage: image }
            })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Profile photo upload error:', error)
        return NextResponse.json({ error: 'Failed to upload photo' }, { status: 500 })
    }
}
