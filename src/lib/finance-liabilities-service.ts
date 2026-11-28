import 'server-only'
import prisma from '@/lib/prisma'
import { calculateTotalBenefit, ReferralData } from '@/lib/benefit-calculator'
import { getSpecialBonusRate } from '@/lib/reward-constants'
import { deduplicateSettlements } from '@/lib/settlement-utils'

/**
 * INTERNAL CORE LOGIC: Fetches and calculates liabilities.
 * Separated to allow system-level access (Cron/Reports) with 100% logic parity.
 */
export async function getAccruedPayoutLiabilitiesInternal(
    admin: any | null, // null for system actions
    yearFilter: string = 'All', 
    search?: string, 
    adminCampusId?: number,
    page: number = 1,
    pageSize: number = 20,
    mode?: 'A' | 'B'
) {
    try {
        // Determine effective scope (SuperAdmin vs Campus Head)
        // If admin is null, we assume system scope (usually guided by adminCampusId if provided)
        let effectiveAdminCampusId = adminCampusId || null
        if (admin && admin.role.includes('Campus')) {
            effectiveAdminCampusId = (admin as any).campusId
        }

        // 0. Fetch campuses first for scope and name mapping
        const campuses = await prisma.campus.findMany({
            select: { id: true, campusName: true }
        })
        
        const campusNameMap = new Map()
        campuses.forEach(c => campusNameMap.set(c.id, c.campusName))

        const financeScopeFilter = effectiveAdminCampusId ? {
            OR: [
                { campusId: Number(effectiveAdminCampusId) }, // Ambassadors assigned to this campus (ID match)
                { assignedCampus: campusNameMap.get(Number(effectiveAdminCampusId)) }, // Ambassadors assigned by name (string match)
                { referrals: { some: { campusId: Number(effectiveAdminCampusId) } } } // Ambassadors with referrals TO this campus
            ]
        } : {}

        // 0. Build search filter
        const searchFilter = search ? {
            OR: [
                { fullName: { contains: search, mode: 'insensitive' as any } },
                { mobileNumber: { contains: search, mode: 'insensitive' as any } },
                { referralCode: { contains: search, mode: 'insensitive' as any } },
                { childName: { contains: search, mode: 'insensitive' as any } },
                { childEprNo: { contains: search, mode: 'insensitive' as any } },
                {
                    referrals: {
                        some: {
                            OR: [
                                { studentName: { contains: search, mode: 'insensitive' as any } },
                                { admissionNumber: { contains: search, mode: 'insensitive' as any } },
                                { parentName: { contains: search, mode: 'insensitive' as any } },
                                { parentMobile: { contains: search, mode: 'insensitive' as any } },
                                { campus: { contains: search, mode: 'insensitive' as any } }
                            ]
                        }
                    }
                }
            ]
        } : {}

        // 1. Fetch AcademicYear record for date boundaries
        let dateRangeFilter: any = {}

        if (yearFilter !== 'All') {
            const yearRecord = await prisma.academicYear.findUnique({
                where: { year: yearFilter }
            })

            dateRangeFilter = yearRecord ? {
                createdAt: {
                    gte: yearRecord.startDate,
                    lte: yearRecord.endDate
                }
            } : {
                createdAt: { gte: new Date('2025-01-01') } // Fallback
            }
        }

        // SENIOR FIX (Data Restoration): Use a simpler but more inclusive filter
        // If query is for a specific year, prioritize academicYear/admittedYear fields first.
        const referralYearFilter = yearFilter !== 'All' ? {
            academicYear: yearFilter
        } : {}

        // --- NEW: DOUBLE-DECOUPLED STRATEGY (P1017 ELIMINATION) ---
        // Step A: Get IDs matching conditions (Year Filter & Mode)
        // SENIOR EXPERT NOTE: Mode MUST be strict.
        const [refUsers, achariyaUsers] = await Promise.all([
            prisma.referralLead.findMany({
                where: {
                    leadStatus: { in: ['Confirmed', 'Admitted'] },
                    ...referralYearFilter,
                    // Apply Mode Filter early to identifiers
                    ...(mode === 'A' ? { user: { role: { in: ['Parent', 'Staff'] } as any, childInAchariya: true } } : {}),
                    ...(mode === 'B' ? { user: { NOT: { role: { in: ['Parent', 'Staff'] } as any, childInAchariya: true } } } : {})
                },
                select: { userId: true },
                distinct: ['userId']
            }),
            prisma.user.findMany({
                where: { 
                    role: { in: ['Parent', 'Staff'] } as any,
                    childInAchariya: true,
                    // If mode is B, this pool is irrelevant
                    ...(mode === 'B' ? { userId: -1 } : {})
                },
                select: { userId: true },
                take: mode === 'B' ? 1 : 5000 // Only fetch for Group A or general view
            })
        ])

        let eligibleUserIds: number[] = Array.from(new Set([
            ...refUsers.map(r => r.userId)
            // achariyaUsers REMOVED: Ledger should only show people with activities (referrals/settlements).
        ]))

        // Step A.5: Add users who already have settlements (even if they have no referrals in current year)
        if (yearFilter === 'All') {
            const usersWithSettlements = await prisma.settlement.findMany({
                where: {
                    AND: [
                        mode === 'A' ? 
                            { user: { role: { in: ['Parent', 'Staff'] } as any, childInAchariya: true } } :
                            { user: { NOT: { role: { in: ['Parent', 'Staff'] } as any, childInAchariya: true } } },
                        { amount: { gt: 25 } } // Exclude registration refunds
                    ]
                },
                select: { userId: true },
                distinct: ['userId']
            })
            eligibleUserIds = Array.from(new Set([...eligibleUserIds, ...usersWithSettlements.map(s => s.userId)]))
        } else {
             // For a specific year, we might want to see those who were paid in this cycle
             const yearRecord = await prisma.academicYear.findUnique({ where: { year: yearFilter } })
             if (yearRecord) {
                 const usersPaidInCycle = await prisma.settlement.findMany({
                     where: {
                         createdAt: { gte: yearRecord.startDate, lte: yearRecord.endDate },
                         amount: { gt: 25 }, // Exclude registration refunds
                         ...(mode === 'A' ? 
                            { user: { role: { in: ['Parent', 'Staff'] } as any, childInAchariya: true } } :
                            { user: { NOT: { role: { in: ['Parent', 'Staff'] } as any, childInAchariya: true } } }
                         )
                     },
                     select: { userId: true },
                     distinct: ['userId']
                 })
                 eligibleUserIds = Array.from(new Set([...eligibleUserIds, ...usersPaidInCycle.map(s => s.userId)]))
             }
        }

        // Step B: Handle Search (Decoupled & Strict)
        if (search) {
            const [userSearchIds, referralSearchIds] = await Promise.all([
                prisma.user.findMany({
                    where: {
                        userId: { in: eligibleUserIds },
                        OR: [
                            { fullName: { contains: search, mode: 'insensitive' as any } },
                            { mobileNumber: { contains: search, mode: 'insensitive' as any } },
                            { referralCode: { contains: search, mode: 'insensitive' as any } },
                            { childName: { contains: search, mode: 'insensitive' as any } },
                            { childEprNo: { contains: search, mode: 'insensitive' as any } }
                        ]
                    },
                    select: { userId: true }
                }),
                prisma.referralLead.findMany({
                    where: {
                        userId: { in: eligibleUserIds },
                        OR: [
                            { studentName: { contains: search, mode: 'insensitive' as any } },
                            { admissionNumber: { contains: search, mode: 'insensitive' as any } },
                            { parentName: { contains: search, mode: 'insensitive' as any } },
                            { parentMobile: { contains: search, mode: 'insensitive' as any } },
                            { campus: { contains: search, mode: 'insensitive' as any } }
                        ]
                    },
                    select: { userId: true },
                    distinct: ['userId']
                })
            ])

            eligibleUserIds = Array.from(new Set([
                ...userSearchIds.map(u => u.userId),
                ...referralSearchIds.map(r => r.userId)
            ]))
        }

        // Step C: Handle Finance Scope (Campus Admin filter)
        if (effectiveAdminCampusId) {
            const campusAmbassadors = await prisma.user.findMany({
                where: {
                    userId: { in: eligibleUserIds },
                    OR: [
                        { campusId: effectiveAdminCampusId }, // Ambassadors assigned to this campus (ID match)
                        { assignedCampus: campusNameMap.get(effectiveAdminCampusId) },
                        { referrals: { some: { campusId: effectiveAdminCampusId } } }
                    ]
                },
                select: { userId: true }
            })
            eligibleUserIds = campusAmbassadors.map(u => u.userId)
        }

        // --- FINAL RESTRAINT: If mode is specified, verify current set remains strictly in mode ---
        // This prevents "dirty" data if the Step A identifications were too broad.
        if (mode === 'A' || mode === 'B') {
            const strictUsers = await prisma.user.findMany({
                where: {
                    userId: { in: eligibleUserIds },
                    ...(mode === 'A' ? { role: { in: ['Parent', 'Staff'] } as any, childInAchariya: true } : {}),
                    ...(mode === 'B' ? { NOT: { role: { in: ['Parent', 'Staff'] } as any, childInAchariya: true } } : {})
                },
                select: { userId: true }
            })
            eligibleUserIds = strictUsers.map(u => u.userId)
        }

        const allLeads = await prisma.referralLead.findMany({
            where: { 
                leadStatus: { in: ['Confirmed', 'Admitted'] },
                ...(yearFilter && yearFilter !== 'All' ? { academicYear: yearFilter } : {}),
                ...(eligibleUserIds.length > 0 ? { userId: { in: eligibleUserIds } } : { userId: -1 }) // -1 ensures empty if no matches
            },
            select: { userId: true },
            take: 50000, // Expanded limit for SuperAdmin totals and large exports
            orderBy: { createdAt: 'desc' }
        })

        // 1. PAGING: Total Count & Clamped Set (Group-Aware)
        // Use eligibleUserIds for count if they represent the ambassadors, 
        // but we need those with Confirmed leads (or Group A base pool).
        const ambassadorsWithLeads = Array.from(new Set(allLeads.map(l => l.userId)))
        
        // Group A also includes Parent/Staff with childInAchariya even if 0 referrals (potential waivers)
        const finalPool = mode === 'A' ? 
            Array.from(new Set([...ambassadorsWithLeads, ...eligibleUserIds])) : 
            ambassadorsWithLeads

        const totalAmbassadorsWithRewards = finalPool.length
        const uniqueUserIds = finalPool.slice((page - 1) * pageSize, page * pageSize)
        
        // 2. Fetch Detailed User Objects
        const [users, slabs, gradeFees, allCampuses] = await Promise.all([
            prisma.user.findMany({
                where: { userId: { in: uniqueUserIds } },
                select: {
                    userId: true,
                    fullName: true,
                    mobileNumber: true,
                    childInAchariya: true,
                    childName: true,
                    grade: true,
                    campusId: true,
                    bankAccountDetails: true,
                    referralCode: true,
                    confirmedReferralCount: true,
                    yearFeeBenefitPercent: true,
                    longTermBenefitPercent: true,
                    isFiveStarMember: true,
                    assignedCampus: true,
                    studentFee: true,
                    academicYear: true,
                    createdAt: true,
                    email: true,
                    address: true,
                    paymentAmount: true,
                    paymentStatus: true,
                    transactionId: true,
                    aadharNo: true,
                    childEprNo: true,
                    empId: true,
                    role: true,
                    status: true,
                    benefitStatus: true,
                    childCampusId: true,
                    accountNumber: true,
                    bankName: true,
                    ifscCode: true,
                    registrationSource: true
                }
            }),
            prisma.benefitSlab.findMany({ orderBy: { referralCount: 'asc' } }),
            prisma.gradeFee.findMany({ where: { academicYear: yearFilter && yearFilter !== 'All' ? yearFilter : '2026-2027' } }),
            prisma.campus.findMany({ select: { id: true, campusName: true } })
        ])

        const userIds = users.map(u => u.userId)
        
        // 3. BULK FETCH RELATED DATA
        const [allSettlements, allReferrals] = await Promise.all([
            prisma.settlement.findMany({
                where: { userId: { in: userIds } }
            }),
            prisma.referralLead.findMany({
                where: {
                    userId: { in: userIds },
                    leadStatus: { in: ['Confirmed', 'Admitted'] },
                    ...referralYearFilter
                },
                include: {
                    student: {
                        select: { studentId: true, fullName: true, grade: true, campusId: true, annualFee: true, baseFee: true, createdAt: true, campus: { select: { campusName: true } } }
                    }
                }
            })
        ])

              // Collect all IDs for the surgical student lookup pool
        const studentIdsToFetch = new Set<number>()
        allReferrals.forEach((r: any) => { 
            if (r.student?.studentId) studentIdsToFetch.add(r.student.studentId) 
        })
        users.forEach((u: any) => { 
            if (u.students) u.students.forEach((s: any) => studentIdsToFetch.add(s.studentId)) 
        })
        const childEprs = users.map(u => u.childEprNo?.trim()?.toUpperCase()).filter(Boolean) as string[]

        // Surgical Student Fetch: Only fetch students linked to these ambassadors
        const allStudents = await prisma.student.findMany({
            where: { 
                OR: [
                    { parentId: { in: userIds } },
                    { admissionNumber: { in: childEprs } },
                    { studentId: { in: Array.from(studentIdsToFetch) } }
                ],
                status: { in: ['Active', 'ACTIVE'] } as any 
            },
            include: { campus: { select: { id: true, campusName: true } }, parent: { select: { mobileNumber: true } } }
        })

        // 4. PREPARE LOOKUP MAPS (O(1) Complexity)
        const campusMap = new Map<number, string>(allCampuses.map(c => [c.id, c.campusName]))
        const settlementMap = new Map<number, any[]>()
        const referralMap = new Map<number, any[]>()
        const eprMap = new Map<string, any>()
        const mobileMap = new Map<string, any[]>()
        const gradeFeeMap = new Map<string, number>()

        allSettlements.forEach(s => {
            if (!settlementMap.has(s.userId)) settlementMap.set(s.userId, [])
            settlementMap.get(s.userId)!.push(s)
        })

        allReferrals.forEach(r => {
            if (!referralMap.has(r.userId)) referralMap.set(r.userId, [])
            referralMap.get(r.userId)!.push(r)
        })

        const studentByParentMap = new Map<number, any[]>()
        const studentByNameMap = new Map<string, any>()
        
        allStudents.forEach(s => {
            if (s.admissionNumber) eprMap.set(s.admissionNumber.toUpperCase(), s)
            if (s.parent?.mobileNumber) {
                if (!mobileMap.has(s.parent.mobileNumber)) mobileMap.set(s.parent.mobileNumber, [])
                mobileMap.get(s.parent.mobileNumber)!.push(s)
            }
            if (s.parentId) {
                if (!studentByParentMap.has(s.parentId)) studentByParentMap.set(s.parentId, [])
                studentByParentMap.get(s.parentId)!.push(s)
            }
            studentByNameMap.set(s.fullName.trim().toUpperCase(), s)
        })

        const normalizeGrade = (g: string) => {
            if (!g) return 'GRADE1'
            let n = g.toUpperCase().trim()
            
            // 1. Remove ALL non-alphanumeric (removes spaces, hyphens, dots)
            n = n.replace(/[^A-Z0-9]/g, '')
            
            // 2. Standardize common prefixes
            n = n.replace('MONTESSORI', 'MONT')
            n = n.replace('PREMONT', 'PREMONT')
            
            // 3. Handle Roman numeral variations (if any survived stripping)
            n = n.replace(/IIIII/g, '5')
            n = n.replace(/IIII/g, '4')
            n = n.replace(/III/g, '3')
            n = n.replace(/II/g, '2')
            n = n.replace(/I/g, '1')
            
            return n
        }

        gradeFees.forEach(gf => {
            const fee = gf.annualFee_wotp || gf.annualFee_otp || 0
            if (fee > 0) {
                const key = gf.campusId + '-' + normalizeGrade(gf.grade)
                gradeFeeMap.set(key, fee)
            }
        })

        const liabilities: any[] = []

        for (const u of (users as any[])) {
            // OPTIMIZED: Use Map for O(1) lookup
            const myStudents = studentByParentMap.get(u.userId) || []
            u.students = myStudents
            
            // 1. INTEL LOGIC: Identify Ambassador's own child first 
            // (Used for Group A fee source AND as a guard to exclude self-referrals)
            let actualChildFee = u.studentFee || 0 // Used for benefit calculation
            let displayChildFee: number | undefined = undefined // Used for UI display
            let childName = undefined
            let childGrade = undefined
            let childCampus = undefined
            let linkedStudent = undefined

            if (u.childInAchariya) {
                // Priority 1: Verified EPR Number (Source of Truth after verification)
                if (u.childEprNo) {
                    linkedStudent = eprMap.get(u.childEprNo.toUpperCase())
                }

                // Priority 2: Direct parent-child link (Database relation)
                if (!linkedStudent && u.students && u.students.length > 0) {
                    linkedStudent = u.students[0]
                }

                // Priority 3: Mobile Number Match (Diagnostic Fallback)
                if (!linkedStudent && u.mobileNumber) {
                    const mobileMatches = mobileMap.get(u.mobileNumber)
                    if (mobileMatches && mobileMatches.length > 0) {
                        linkedStudent = mobileMatches[0]
                    }
                }

                // Priority 4: Fuzzy Name Match (Fallback for split-accounts/mislinked parents)
                if (!linkedStudent && u.childName) {
                    linkedStudent = studentByNameMap.get(u.childName.trim().toUpperCase())
                }

                if (linkedStudent) {
                    const studentFee = (linkedStudent as any).annualFee || (linkedStudent as any).baseFee || gradeFeeMap.get(linkedStudent.campusId + '-' + normalizeGrade(linkedStudent.grade)) || actualChildFee
                    actualChildFee = studentFee
                    displayChildFee = studentFee
                    childName = linkedStudent.fullName
                    childGrade = linkedStudent.grade
                    childCampus = (linkedStudent.campus as any)?.campusName || undefined
                } else {
                    // FALLBACK: Use data from User Profile if no Student record is linked
                    childName = u.childName || undefined
                    childGrade = u.grade || undefined
                    
                    const cId = (u as any).childCampusId || (u as any).campusId
                    childCampus = cId ? campusMap.get(cId) : undefined
                    
                    // Try to resolve the fee based on the profile grade/campus
                    const rawGrade = u.grade || 'Grade-1'
                    const normGrade = normalizeGrade(rawGrade)
                    const key = cId + '-' + normGrade
                    let profileFee = gradeFeeMap.get(key)
                    
                    // AUDIT GUARD: Handle "MONT" naming split manually if direct key fails
                    if (!profileFee && normGrade.startsWith('MONT')) {
                        // Attempt lookup with and without hyphen if table naming is inconsistent
                        const altKey = cId + '-' + normGrade.replace('-', '')
                        profileFee = gradeFeeMap.get(altKey)
                    }
                    
                    displayChildFee = profileFee || u.studentFee || 0
                    actualChildFee = displayChildFee
                }
            }

            // 2. Self-Referral Guard: Identify student IDs and names already linked to this ambassador
            const ownStudentIds = (u.students || []).map((s: any) => s.studentId)
            if (linkedStudent) ownStudentIds.push(linkedStudent.studentId)

            const normalizedOwnChild = childName?.trim().toUpperCase() || u.childName?.trim().toUpperCase()
            const isGroupAEligible = (u.role === 'Parent' || u.role === 'Staff') && u.childInAchariya === true

            // 3. Map ReferralLeads to ReferralData for the calculator
            const userReferrals = referralMap.get(u.userId) || []
            const currentReferrals: ReferralData[] = userReferrals
                .filter((r: any) => {
                    // ðŸš¨ SENIOR AUDIT GUARD: Exclude Self-Referrals (Own Children)
                    // Policy: Own children not allowed as referrals.
                    // REFINED: We only skip if the student record is ALREADY linked to this parent as their child.
                    // This allows NEW admissions (even siblings) to count for the current cycle.

                    // 1. [RELAXED] Allowing mobile match as many ambassadors register for their leads.
                    // if (r.parentMobile === u.mobileNumber) return false

                    // 2. STAGE 2 GUARD: Check if the referred student is already linked to the ambassador as THEIR child.
                    if (r.student?.studentId && ownStudentIds.includes(r.student.studentId)) return false

                    // 3. [RELAXED] Potential false positives on name match.
                    // if (normalizedOwnChild && r.studentName?.trim().toUpperCase() === normalizedOwnChild) return false

                    // 4. [RELAXED] ERP check handled by studentId above for admitted students.
                    // if (r.admissionNumber && u.childEprNo && r.admissionNumber.trim().toUpperCase() === u.childEprNo.trim().toUpperCase()) return false

                    return true
                })
                .map((r: any) => {
                    const campusName = r.campus || (r.campusId ? campusNameMap.get(r.campusId) : null)
                    let fallbackCampusId = r.campusId
                    
                    if (campusName === 'SSV HSC- VILLIANUR' || campusName === 'SSV HSC - VILLIANUR') {
                        const ssvId = Array.from(campusNameMap.entries()).find(([_, name]) => name === 'SSV - VILLIANUR')?.[0]
                        if (ssvId) fallbackCampusId = ssvId
                    } else if (campusName === 'ASM HSC - VILLIANUR') {
                        const asmId = Array.from(campusNameMap.entries()).find(([_, name]) => name === 'ASM - VILLIANUR')?.[0]
                        if (asmId) fallbackCampusId = asmId
                    }

                    const normGradeValue = normalizeGrade(r.gradeInterested || 'Grade-1')
                    const isMontOrPreMont = normGradeValue.includes('MONT') || normGradeValue.includes('PREMONT');
                    const gradeLookup = isMontOrPreMont ? normGradeValue : normalizeGrade('Grade-1');
                    
                    const gradeKey = fallbackCampusId + '-' + gradeLookup
                    const gFeeFromTable = gradeFeeMap.get(gradeKey) 
                    const specialBonusRate = getSpecialBonusRate(campusName)
                    
                    return {
                        id: r.leadId,
                        leadId: r.leadId,
                        academicYear: r.academicYear,
                        studentName: r.studentName,
                        parentName: r.parentName,
                        parentMobile: r.parentMobile,
                        admissionNumber: r.admissionNumber,
                        campusId: r.campusId || 0,
                        campusName: campusName || undefined,
                        campus: campusName || undefined, // Added for frontend compatibility
                        grade: r.gradeInterested || 'Grade-1',
                        gradeInterested: r.gradeInterested || 'Grade-1', // Added for frontend compatibility
                        actualFee: Number(r.annualFee) || 0,
                        annualFee: Number(r.annualFee) || 0, // Added for report-utils compatibility
                        campusGrade1Fee: Number(gFeeFromTable) || 0,  // Renamed in logic to use the specific grade fee
                        admissionFeeCollected: Number(r.admissionFeeCollected) || 0,
                        donationFeeCollected: Number(r.donationFeeCollected) || 0,
                        specialBonusRate: Number(specialBonusRate) || 0,
                        createdAt: r.createdAt,
                        confirmedDate: r.confirmedDate,
                        studentCreatedAt: r.student?.createdAt,
                        student: r.student, // Pass through for reports
                        // Fix (Senior Audit): Differentiate missing data by Group
                        feeDataMissing: (isGroupAEligible && !actualChildFee && !specialBonusRate) || 
                                       (!isGroupAEligible && !gFeeFromTable && !specialBonusRate)
                    }
                })
                .sort((a: any, b: any) => {
                    const dateA = a.confirmedDate ? new Date(a.confirmedDate).getTime() : new Date(a.createdAt).getTime()
                    const dateB = b.confirmedDate ? new Date(b.confirmedDate).getTime() : new Date(b.createdAt).getTime()
                    return dateA - dateB
                })

            const calcResult = calculateTotalBenefit(currentReferrals, {
                role: u.role as any,
                childInAchariya: u.childInAchariya,
                studentFee: actualChildFee,
                isFiveStarLastYear: u.isFiveStarMember
            }, slabs as any)

            // FIX (Audit P0-#2 & Deduplication): Split settled amounts by settlement type with UTR batch deduplication
            // Cash payouts (Admission + Donation) must NOT reduce the waiver balance and vice versa.
            const userSettlements = settlementMap.get(u.userId) || []
            const nonRefundSettlements = userSettlements.filter((s: any) => {
                if (s.status !== 'Processed') return false
                const remarks = (s.remarks || '').toLowerCase()
                const isRefund = remarks.includes('registration') || remarks.includes('refund') || s.amount === 25
                return !isRefund
            })
            const validSettlements = deduplicateSettlements(nonRefundSettlements)

            // 4. PREPARE TYPE-AWARE FIFO POOLS (Unlinked Settlements)
            const genericSettlements = validSettlements.filter((s: any) => !s.referralLeadId)
            let runningAdm = genericSettlements.filter((s: any) => s.benefitType === 'ADMISSION_SHARE').reduce((acc: number, s: any) => acc + (s.amount || 0), 0)
            let runningDon = genericSettlements.filter((s: any) => s.benefitType === 'DONATION_SHARE').reduce((acc: number, s: any) => acc + (s.amount || 0), 0)
            let runningSlab = genericSettlements.filter((s: any) => s.benefitType === 'SLAB_SHARE').reduce((acc: number, s: any) => acc + (s.amount || 0), 0)
            let runningGreedy = genericSettlements.filter((s: any) => !s.benefitType || s.benefitType === 'OTHER' || s.benefitType === 'SPECIAL_BONUS').reduce((acc: number, s: any) => acc + (s.amount || 0), 0)

            const specialBonus = calcResult.specialBonusShare
            const profitShares = calcResult.admissionShare + calcResult.donationShare
            const slabRewards = calcResult.slabShare + (calcResult as any).longTermBaseAmount || 0
            const totalAllEarnings = specialBonus + profitShares + slabRewards

            let finalPayoutEarned = 0
            let finalWaiverEarned = 0
            const isGroupAEligible_OldPlace = true; // Placeholder for clean diff

            if (isGroupAEligible && childName && (displayChildFee ?? 0) > 0) {
                finalWaiverEarned = slabRewards || 0
                finalPayoutEarned = (totalAllEarnings || 0) - finalWaiverEarned
            } else {
                finalPayoutEarned = totalAllEarnings || 0
            }

            const totalSettled = validSettlements.reduce((acc: number, s: any) => acc + (s.amount || 0), 0)
            let rem = totalSettled
            const payoutSettled = Math.min(finalPayoutEarned, rem); rem -= payoutSettled
            const waiverSettled = Math.min(finalWaiverEarned, rem)

            const payoutOutstanding = finalPayoutEarned - payoutSettled
            const waiverOutstanding = finalWaiverEarned - waiverSettled

            const sortedRef = currentReferrals

            const runningCountByYear: Record<string, number> = {}
            // ONE PASS FOR ENRICHMENT AND FIFO
            const enrichedReferrals = sortedRef.map((r: any, idx: number) => {
                const admFee = r.admissionFeeCollected || 0
                const donFee = r.donationFeeCollected || 0

                const isAdmissionSettled = userSettlements.some((s: any) => s.referralLeadId === r.id && s.benefitType === 'ADMISSION_SHARE' && s.status === 'Processed')
                const isDonationSettled = userSettlements.some((s: any) => s.referralLeadId === r.id && s.benefitType === 'DONATION_SHARE' && s.status === 'Processed')
                const isSlabSettled = userSettlements.some((s: any) => s.referralLeadId === r.id && s.benefitType === 'SLAB_SHARE' && s.status === 'Processed')
                const isSpecialBonusSettled = userSettlements.some((s: any) => s.referralLeadId === r.id && s.benefitType === 'SPECIAL_BONUS' && s.status === 'Processed')

                const isAdmissionPending = userSettlements.some((s: any) => s.referralLeadId === r.id && s.benefitType === 'ADMISSION_SHARE' && s.status === 'Pending')
                const isDonationPending = userSettlements.some((s: any) => s.referralLeadId === r.id && s.benefitType === 'DONATION_SHARE' && s.status === 'Pending')
                const isSlabPending = userSettlements.some((s: any) => s.referralLeadId === r.id && s.benefitType === 'SLAB_SHARE' && s.status === 'Pending')
                const isSpecialBonusPending = userSettlements.some((s: any) => s.referralLeadId === r.id && s.benefitType === 'SPECIAL_BONUS' && s.status === 'Pending')

                let slabPercent = 0
                const hasSpecialBonus = (r.specialBonusRate || 0) > 0
                
                const ay = r.academicYear || '2026-2027'
                if (!runningCountByYear[ay]) runningCountByYear[ay] = 0

                let currentStdCount = runningCountByYear[ay] // Default if special bonus

                if (hasSpecialBonus) {
                    slabPercent = 0
                    // Still increment count? Usually special bonus referrals do NOT count towards slabs.
                    // If they don't, we leave the count alone. Wait, the original code didn't increment it!
                } else {
                    runningCountByYear[ay]++
                    currentStdCount = runningCountByYear[ay]
                    const getSlabPercent = (c: number) => {
                        const cappedCount = Math.min(c, 5)
                        const slab = slabs.find((s: any) => s.referralCount === cappedCount) || slabs[slabs.length - 1]
                        const basePercent = slab?.yearFeeBenefitPercent || 0
                        if (c > 5) {
                            return basePercent + ((c - 5) * 5)
                        }
                        return basePercent
                    }
                    slabPercent = Math.max(0, getSlabPercent(currentStdCount) - (currentStdCount === 1 ? 0 : getSlabPercent(currentStdCount - 1)))
                }

                const slabBase = isGroupAEligible ? (actualChildFee || 0) : (r.campusGrade1Fee || 0)
                const referralSlabValue = Math.round((slabBase * slabPercent) / 100)
                const admShareValue = hasSpecialBonus ? 0 : Math.round(admFee * 0.8)
                const donShareValue = hasSpecialBonus ? 0 : Math.round(donFee * 0.5)

                // Virtual FIFO consumption
                const admVirtual = !isAdmissionSettled ? Math.min(admShareValue, runningAdm) : 0
                runningAdm -= admVirtual
                const donVirtual = !isDonationSettled ? Math.min(donShareValue, runningDon) : 0
                runningDon -= donVirtual
                const slabVirtual = !isSlabSettled ? Math.min(referralSlabValue, runningSlab) : 0
                runningSlab -= slabVirtual

                const specialBonusValue = r.specialBonusRate || 0
                const specialVirtual = !isSpecialBonusSettled ? Math.min(specialBonusValue, runningGreedy) : 0
                runningGreedy -= specialVirtual

                const referralTotal = admShareValue + donShareValue + referralSlabValue + specialBonusValue
                let virtuallyPaidAmount = admVirtual + donVirtual + slabVirtual + specialVirtual

                // Count DB-settled amounts (e.g. paid via Release button) that virtual FIFO didn't cover
                const dbSettledValue =
                    (isAdmissionSettled ? admShareValue : 0) +
                    (isDonationSettled ? donShareValue : 0) +
                    (isSlabSettled ? referralSlabValue : 0) +
                    (isSpecialBonusSettled ? specialBonusValue : 0)
                const totalEffectivePaid = virtuallyPaidAmount + dbSettledValue

                let payoutStatus = 'PENDING'
                if (totalEffectivePaid >= referralTotal && referralTotal > 0) payoutStatus = 'PAID'
                else if (totalEffectivePaid > 0) payoutStatus = 'PARTIAL'

                return {
                    ...r,
                    referralNumber: currentStdCount,
                    slabPercent,
                    admShareValue,
                    donShareValue,
                    referralSlabValue,
                    specialBonusValue,
                    virtuallyPaidAmount,
                    dbSettledValue,
                    totalEffectivePaid,
                    payoutStatus,
                    // BUTTONS: Disable if database settled OR virtually settled
                    isAdmissionReady: admShareValue > 0 && !isAdmissionSettled && !isAdmissionPending && admVirtual <= 0,
                    isDonationReady: donShareValue > 0 && !isDonationSettled && !isDonationPending && donVirtual <= 0,
                    isSlabReady: referralSlabValue > 0 && !isSlabSettled && !isSlabPending && slabVirtual <= 0,
                    isSpecialBonusReady: specialBonusValue > 0 && !isSpecialBonusSettled && !isSpecialBonusPending && specialVirtual <= 0,
                    isAdmissionSettled: isAdmissionSettled || (admVirtual > 0 && admVirtual >= admShareValue),
                    isDonationSettled: isDonationSettled || (donVirtual > 0 && donVirtual >= donShareValue),
                    isSlabSettled: isSlabSettled || (slabVirtual > 0 && slabVirtual >= referralSlabValue),
                    isSpecialBonusSettled: isSpecialBonusSettled || (specialVirtual > 0 && specialVirtual >= specialBonusValue),
                    isAdmissionPending,
                    isDonationPending,
                    isSlabPending,
                    isSpecialBonusPending,
                    user: u // Pass parent user context back for report flattening
                }
            })

            const missingFeeReferrals = currentReferrals.filter((r: any) => r.feeDataMissing)
            const hasMissingFeeData = (missingFeeReferrals.length > 0) || (isGroupAEligible && !displayChildFee && slabs.length > 0)
            const missingFeeCampuses = Array.from(new Set(missingFeeReferrals.map((r: any) => r.campusName || `Campus ID ${r.campusId}`)))

            let latestReferralTime = 0
                for (const r of currentReferrals) {
                    // Check Entry Date
                    const time1 = r.createdAt ? new Date(r.createdAt).getTime() : 0
                    if (!isNaN(time1) && time1 > latestReferralTime) latestReferralTime = time1

                    // Check Confirmation Date
                    const time2 = r.confirmedDate ? new Date(r.confirmedDate).getTime() : 0
                    if (!isNaN(time2) && time2 > latestReferralTime) latestReferralTime = time2

                    // Check Admission/Sync Date (Student Creation)
                    const time3 = r.studentCreatedAt ? new Date(r.studentCreatedAt).getTime() : 0
                    if (!isNaN(time3) && time3 > latestReferralTime) latestReferralTime = time3
                }

            const isNew = latestReferralTime > (Date.now() - 48 * 60 * 60 * 1000)

            const finalReferrals = effectiveAdminCampusId 
                ? enrichedReferrals.filter((r: any) => r.campusId === effectiveAdminCampusId)
                : enrichedReferrals

            if (isGroupAEligible) {
                // Unified record for Group A (Staff/Parents)
                // Only show if they have referrals in THIS specific year (prevents year bleed-through)
                if (finalReferrals.length > 0) {
                    const totalOutstanding = totalAllEarnings - totalSettled
                    liabilities.push({
                        userId: u.userId,
                        ledgerId: `${u.userId}-A`,
                        // user: u, // REMOVED: Potential circular ref / serialization overhead
                        fullName: u.fullName,
                        mobileNumber: u.mobileNumber,
                        referralCode: u.referralCode || undefined,
                        role: u.role,
                        confirmedReferralCount: currentReferrals.length, // Keep global count
                        benefitPercent: (calcResult as any).tierPercent || 0,
                        campusName: (u as any).assignedCampus || 'N/A',
                        totalEarned: totalAllEarnings,
                        totalSettled: totalSettled,
                        outstanding: totalOutstanding,
                        remainingAmount: totalOutstanding,
                        childName,
                        childEprNo: (u as any).childEprNo || undefined,
                        childGrade,
                        childCampus,
                        childFee: displayChildFee,
                        breakdown: calcResult.breakdown,
                        referrals: finalReferrals,
                        slabShare: slabRewards,
                        admissionShare: calcResult.admissionShare,
                        donationShare: calcResult.donationShare,
                        specialBonusShare: calcResult.specialBonusShare,
                        appBonusPercent: calcResult.appBonusPercent,
                        hasMissingFeeData,
                        missingFeeCampuses,
                        academicYear: (u as any).academicYear,
                        aadharNo: (u as any).aadharNo,
                        address: (u as any).address,
                        bankName: (u as any).bankName,
                        accountNumber: (u as any).accountNumber,
                        ifscCode: (u as any).ifscCode,
                        bankAccountDetails: (u as any).bankAccountDetails,
                        type: 'Unified',
                        group: 'Group A',
                        isNew,
                        latestActivityDate: latestReferralTime
                    })
                }
            } else if (finalReferrals.length > 0) {
                // Group B for others (Friends/Alumni/Others) - only if they have referrals this year
                liabilities.push({
                    userId: u.userId,
                    ledgerId: `${u.userId}-B`,
                    // user: u, // REMOVED: Potential circular ref / serialization overhead
                    fullName: u.fullName,
                    mobileNumber: u.mobileNumber,
                    referralCode: u.referralCode || undefined,
                    role: u.role,
                    confirmedReferralCount: currentReferrals.length, // Keep global count
                    benefitPercent: (calcResult as any).tierPercent || 0,
                    campusName: (u as any).assignedCampus || 'N/A',
                    totalEarned: finalPayoutEarned,
                    totalSettled: payoutSettled,
                    outstanding: payoutOutstanding,
                    remainingAmount: payoutOutstanding,
                    childName: undefined,
                    childEprNo: undefined,
                    childGrade: undefined,
                    childCampus: undefined,
                    childFee: undefined,
                    breakdown: calcResult.breakdown,
                    referrals: finalReferrals,
                    slabShare: slabRewards,
                    admissionShare: calcResult.admissionShare,
                    donationShare: calcResult.donationShare,
                    specialBonusShare: calcResult.specialBonusShare,
                    appBonusPercent: calcResult.appBonusPercent,
                    hasMissingFeeData,
                    missingFeeCampuses,
                    academicYear: (u as any).academicYear,
                    aadharNo: (u as any).aadharNo,
                    address: (u as any).address,
                    bankName: (u as any).bankName,
                    accountNumber: (u as any).accountNumber,
                    ifscCode: (u as any).ifscCode,
                    bankAccountDetails: (u as any).bankAccountDetails,
                    type: 'Payout',
                    group: 'Group B',
                    isNew,
                    latestActivityDate: latestReferralTime
                })
            }
        }

        // --- ENHANCEMENT: EXPLICIT SORT BY LATEST ACTIVITY ---
        liabilities.sort((a, b) => (b.latestActivityDate || 0) - (a.latestActivityDate || 0))

        return { success: true, data: liabilities, totalCount: totalAmbassadorsWithRewards }

    } catch (error: any) {
        console.error('Error fetching accrued liabilities:', error)
        return { success: false, error: error.message || 'Failed to fetch liabilities' }
    }
}
