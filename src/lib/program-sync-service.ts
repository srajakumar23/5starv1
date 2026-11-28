import 'server-only'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

/**
 * Robust CSV parser that handles quoted fields correctly
 */
function parseCSV(text: string): string[][] {
    const rows: string[][] = [];
    const lines = text.split(/\r?\n/);

    for (const line of lines) {
        if (!line.trim()) continue;

        const row: string[] = [];
        let inQuotes = false;
        let currentValue = '';

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                row.push(currentValue.trim());
                currentValue = '';
            } else {
                currentValue += char;
            }
        }
        row.push(currentValue.trim());
        rows.push(row);
    }
    return rows;
}

export async function runSyncProgramLeads() {
    try {
        const programs = await prisma.externalProgram.findMany({
            where: { isActive: true, NOT: { autoSyncUrl: null } }
        })

        const results = []

        for (const program of programs) {
            if (!program.autoSyncUrl) continue;

            try {
                // 1. Fetch CSV with browser-like User-Agent to avoid HTML redirects
                const response = await fetch(program.autoSyncUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                })
                let text = await response.text()

                // Check if we received HTML (redirection/login page) instead of CSV
                if (text.includes('<html') || text.includes('DOCTYPE html')) {
                    console.error(`Sync aborted for "${program.title}": Received HTML content instead of CSV. Check sheet publishing.`)
                    results.push({ program: program.title, status: 'Failed', error: 'Sheet returned HTML (Not Published/Auth Issue)' })
                    continue
                }

                // Remove UTF-8 BOM if present
                if (text.charCodeAt(0) === 0xFEFF) {
                    text = text.substring(1);
                }

                // 2. Parse CSV robustly
                const rows = parseCSV(text)
                if (rows.length < 2) continue

                // 3. Detect Headers (Robustly handle underscores, spaces, hyphens)
                const normalize = (h: string) => h.trim().toLowerCase().replace(/[_\s-]/g, '')
                const headers = rows[0].map(h => normalize(h))

                // Better Mobile detection
                const mobileIndex = headers.findIndex(h =>
                    h === 'mobile' || h === 'phone' || h === 'contact' ||
                    h.includes('mobile') || h.includes('phonenumber') || h.includes('contactnumber')
                )

                // Better Name detection
                const nameIndex = headers.findIndex(h =>
                    h === 'name' || h === 'student' || h === 'studentname' || h === 'fullname' ||
                    h.includes('student') || h.includes('child') || h.includes('candidate') || (h.includes('name') && !h.includes('parent'))
                )

                // detect Payment Status column
                const paymentStatusIndex = headers.findIndex(h =>
                    h.includes('paymentstatus') || h.includes('orderstatus') || h.includes('status')
                )

                if (mobileIndex === -1) {
                    results.push({ program: program.title, status: 'Failed', error: 'No Mobile column found' })
                    continue
                }

                // 4. Extract and Deduplicate Data (Ensure Success wins over Pending)
                const rawLeads = rows.slice(1).map(row => {
                    const rawMobile = row[mobileIndex]
                    if (!rawMobile) return null

                    const mobile = rawMobile.replace(/\D/g, '').slice(-10)
                    if (mobile.length !== 10) return null

                    let studentName = null
                    if (nameIndex !== -1 && row[nameIndex]) {
                        studentName = row[nameIndex].trim()
                    }

                    let paymentStatus = null
                    if (paymentStatusIndex !== -1 && row[paymentStatusIndex]) {
                        paymentStatus = row[paymentStatusIndex].trim().toUpperCase()
                    }

                    return { mobile, studentName, paymentStatus }
                }).filter((l): l is { mobile: string, studentName: string | null, paymentStatus: string | null } => l !== null)

                if (rawLeads.length === 0) {
                    results.push({ program: program.title, status: 'Success', synced: 0, message: 'No valid leads in file' })
                    continue
                }

                // Deduplicate: Group by mobile and merge the "best" data (Success > Pending, Longest Name)
                const successKeywords = ['SUCCESS', 'PAID', 'CONFIRMED', 'COMPLETED', 'CAPTURED']
                const deduplicatedMap = new Map<string, typeof rawLeads[0]>()

                for (const lead of rawLeads) {
                    const existing = deduplicatedMap.get(lead.mobile)
                    if (!existing) {
                        deduplicatedMap.set(lead.mobile, { ...lead })
                        continue
                    }

                    // 1. Prioritize Success Status
                    const isNewSuccess = lead.paymentStatus && successKeywords.includes(lead.paymentStatus)
                    const isExistingSuccess = existing.paymentStatus && successKeywords.includes(existing.paymentStatus)

                    if (isNewSuccess && !isExistingSuccess) {
                        existing.paymentStatus = lead.paymentStatus
                    }

                    // 2. Prioritize Most Complete Name
                    if (lead.studentName) {
                        if (!existing.studentName || lead.studentName.length > existing.studentName.length) {
                            existing.studentName = lead.studentName
                        }
                    }
                }

                const leadsToUpdate = Array.from(deduplicatedMap.values())

                // 5. Update Database
                let updatedCount = 0

                // Fetch relevant leads first to minimize queries (fetch even REGISTERED ones if we want to sync names)
                const targetMobiles = leadsToUpdate.map(l => l.mobile)
                const potentialLeads = await prisma.programLead.findMany({
                    where: {
                        programId: program.id,
                        visitorMobile: { in: targetMobiles }
                    }
                })

                // Create a map for quick access (Multiple leads per mobile)
                const leadMap = new Map<string, typeof potentialLeads>()
                potentialLeads.forEach(l => {
                    const existing = leadMap.get(l.visitorMobile) || []
                    leadMap.set(l.visitorMobile, [...existing, l])
                })

                // Perform updates
                const updates = leadsToUpdate.flatMap((leadData) => {
                    const matchingLeads = leadMap.get(leadData.mobile) || []

                    return matchingLeads.map(async (existingLead) => {
                        try {
                            // Determine internal status based on sheets payment status
                            let newInternalStatus = existingLead.status
                            const ps = (leadData.paymentStatus || "").toUpperCase()

                            // If payment is successful, mark as REGISTERED
                            if (['SUCCESS', 'PAID', 'CONFIRMED', 'COMPLETED', 'CAPTURED'].includes(ps)) {
                                newInternalStatus = 'REGISTERED'
                            }

                            await prisma.programLead.update({
                                where: { id: existingLead.id },
                                data: {
                                    status: newInternalStatus,
                                    registeredAt: newInternalStatus === 'REGISTERED' && existingLead.status !== 'REGISTERED' ? new Date() : existingLead.registeredAt,
                                    studentName: leadData.studentName,
                                    paymentStatus: leadData.paymentStatus
                                }
                            })
                            return 1
                        } catch (e) {
                            return 0
                        }
                    })
                })

                const resultsArray = await Promise.all(updates)
                updatedCount = resultsArray.reduce((acc: number, val) => acc + val, 0)

                results.push({ program: program.title, status: 'Success', synced: updatedCount })

            } catch (err) {
                console.error(`Sync failed for ${program.title}:`, err)
                results.push({ program: program.title, status: 'Error', error: 'Fetch/Parse failed' })
            }
        }

        revalidatePath('/dashboard')
        revalidatePath('/program-leads')
        revalidatePath('/superadmin/program-leads', 'page')
        revalidatePath('/campus', 'layout')

        return { success: true as const, results }

    } catch (error) {
        console.error('Global Sync Error:', error)
        return { success: false as const, error: 'Sync Process Failed', results: [] as any[] }
    }
}
