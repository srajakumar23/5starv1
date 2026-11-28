import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { calculateTotalBenefit, DEBUG_LOGS } from '../lib/benefit-calculator'
import { getSpecialBonusRate } from '../lib/reward-constants'

const SAMPLE_SLABS = [
    { slabId: 1, tierName: 'Tier 1', referralCount: 1, yearFeeBenefitPercent: 5, longTermExtraPercent: 3, baseLongTermPercent: 15, description: null, appBonusPercent: 5, appBonusEligibility: 'PARENT,STAFF_CHILD' },
    { slabId: 2, tierName: 'Tier 2', referralCount: 2, yearFeeBenefitPercent: 10, longTermExtraPercent: 3, baseLongTermPercent: 15, description: null, appBonusPercent: 5, appBonusEligibility: 'PARENT,STAFF_CHILD' },
    { slabId: 3, tierName: 'Tier 3', referralCount: 3, yearFeeBenefitPercent: 25, longTermExtraPercent: 3, baseLongTermPercent: 15, description: null, appBonusPercent: 5, appBonusEligibility: 'PARENT,STAFF_CHILD' },
    { slabId: 4, tierName: 'Tier 4', referralCount: 4, yearFeeBenefitPercent: 30, longTermExtraPercent: 3, baseLongTermPercent: 15, description: null, appBonusPercent: 5, appBonusEligibility: 'PARENT,STAFF_CHILD' },
    { slabId: 5, tierName: 'Tier 5', referralCount: 5, yearFeeBenefitPercent: 50, longTermExtraPercent: 3, baseLongTermPercent: 15, description: null, appBonusPercent: 5, appBonusEligibility: 'PARENT,STAFF_CHILD' },
]

function makeStdRefs(count: number, campusGrade1Fee = 50000) {
    return Array.from({ length: count }, (_, idx) => ({
        id: idx + 1,
        campusId: 1,
        grade: 'Grade-1',
        campusGrade1Fee,
    }))
}

describe('benefit-calculator', () => {
    it('calculates Group A (Parent/Staff with child) cumulative slab waivers and +5%/ref above 5', () => {
        const res1 = calculateTotalBenefit(
            makeStdRefs(1),
            { role: 'Parent', childInAchariya: true, studentFee: 60000 },
            SAMPLE_SLABS
        )
        assert.equal(res1.tierPercent, 5)
        assert.equal(res1.slabShare, 3000)
        assert.equal(res1.appBonusPercent, 5)

        const res3 = calculateTotalBenefit(
            makeStdRefs(3),
            { role: 'Staff', childInAchariya: true, studentFee: 60000 },
            SAMPLE_SLABS
        )
        assert.equal(res3.tierPercent, 25)
        assert.equal(res3.slabShare, 15000)
        assert.equal(res3.appBonusPercent, 5)

        const res6 = calculateTotalBenefit(
            makeStdRefs(6),
            { role: 'Parent', childInAchariya: true, studentFee: 60000 },
            SAMPLE_SLABS
        )
        assert.equal(res6.tierPercent, 55)
        assert.equal(res6.slabShare, 33000)
    })

    it('calculates Group B marginal per-referral Grade-1 fee slices', () => {
        const res = calculateTotalBenefit(
            makeStdRefs(3, 50000),
            { role: 'Alumni', childInAchariya: false },
            SAMPLE_SLABS
        )
        // Marginal slices: 5% (2500) + 5% (2500) + 15% (7500) = 12500
        assert.equal(res.slabShare, 12500)
        assert.equal(res.totalAmount, 12500)
        assert.equal(res.appBonusPercent, 0)
    })

    it('adds 80% admission and 50% donation shares on standard referrals', () => {
        const res = calculateTotalBenefit(
            [
                {
                    id: 101,
                    campusId: 1,
                    grade: 'Grade-1',
                    campusGrade1Fee: 50000,
                    admissionFeeCollected: 10000,
                    donationFeeCollected: 20000,
                },
            ],
            { role: 'Alumni', childInAchariya: false },
            SAMPLE_SLABS
        )
        assert.equal(res.admissionShare, 8000)
        assert.equal(res.donationShare, 10000)
        assert.equal(res.slabShare, 2500)
        assert.equal(res.totalAmount, 20500)
    })

    it('resolves special campus bonuses and isolates them from standard slabs/profit shares', () => {
        assert.equal(getSpecialBonusRate('ACET'), 5000)
        assert.equal(getSpecialBonusRate('AASC - Villianur'), 2000)
        assert.equal(getSpecialBonusRate('ACCHM'), 2000)
        assert.equal(getSpecialBonusRate('ASM - Villianur'), 0)

        const res = calculateTotalBenefit(
            [
                {
                    id: 201,
                    campusId: 9,
                    campusName: 'ACET',
                    grade: 'Grade-1',
                    specialBonusRate: getSpecialBonusRate('ACET'),
                    admissionFeeCollected: 10000,
                    donationFeeCollected: 20000,
                },
            ],
            { role: 'Alumni', childInAchariya: false },
            SAMPLE_SLABS
        )
        assert.equal(res.specialBonusShare, 5000)
        assert.equal(res.slabShare, 0)
        assert.equal(res.admissionShare, 0)
        assert.equal(res.donationShare, 0)
        assert.equal(res.totalAmount, 5000)
    })

    it('enforces 5-Star historic 3% base activation rule (0 current = inactive, 1+ = active on top 5)', () => {
        const prevRefs = Array.from({ length: 6 }, (_, i) => ({
            id: 300 + i,
            campusId: 1,
            grade: 'Grade-1',
            actualFee: 50000,
        }))

        const inactive = calculateTotalBenefit(
            [],
            { role: 'Parent', childInAchariya: true, studentFee: 60000, isFiveStarLastYear: true, previousYearReferrals: prevRefs },
            SAMPLE_SLABS
        )
        assert.equal(inactive.isLongActive, false)
        assert.equal(inactive.longTermBaseAmount, 0)

        const active = calculateTotalBenefit(
            makeStdRefs(1),
            { role: 'Parent', childInAchariya: true, studentFee: 60000, isFiveStarLastYear: true, previousYearReferrals: prevRefs },
            SAMPLE_SLABS
        )
        // Top 5 referrals * floor(50000 * 0.03 = 1500) = 7500; plus 5% of 60000 = 3000
        assert.equal(active.isLongActive, true)
        assert.equal(active.longTermBaseAmount, 7500)
        assert.equal(active.slabShare, 3000)
        assert.equal(active.totalAmount, 10500)
        assert.equal(active.appBonusPercent, 0)
    })

    it('never leaks unbounded debug entries into DEBUG_LOGS', () => {
        assert.equal(DEBUG_LOGS.length, 0)
    })
})
