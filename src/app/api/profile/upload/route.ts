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

        const match = image.match(/^data:image\/(jpeg|jpg|png|webp|gif);base64,(.+)$/i)
        if (!match) {
            return NextResponse.json({ error: 'Invalid image format. Allowed: JPEG, PNG, WebP, GIF.' }, { status: 400 })
        }

        // Guard against raw multi-MB Base64 payloads
        if (image.length > 2_000_000) {
            return NextResponse.json({ error: 'Image is too large. Please choose a smaller photo.' }, { status: 400 })
        }

        // Magic-byte verification on binary header to reject spoofed non-image payloads
        const declaredType = match[1].toLowerCase()
        const headerBytes = Buffer.from(match[2].slice(0, 32), 'base64')
        const isJpeg = headerBytes.length >= 3 && headerBytes[0] === 0xff && headerBytes[1] === 0xd8 && headerBytes[2] === 0xff
        const isPng = headerBytes.length >= 4 && headerBytes[0] === 0x89 && headerBytes[1] === 0x50 && headerBytes[2] === 0x4e && headerBytes[3] === 0x47
        const isGif = headerBytes.length >= 4 && headerBytes.toString('ascii', 0, 4) === 'GIF8'
        const isWebp = headerBytes.length >= 12 && headerBytes.toString('ascii', 0, 4) === 'RIFF' && headerBytes.toString('ascii', 8, 12) === 'WEBP'

        const magicMatches =
            ((declaredType === 'jpeg' || declaredType === 'jpg') && isJpeg) ||
            (declaredType === 'png' && isPng) ||
            (declaredType === 'gif' && isGif) ||
            (declaredType === 'webp' && isWebp)

        if (!magicMatches) {
            return NextResponse.json({ error: 'Invalid image content.' }, { status: 400 })
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
