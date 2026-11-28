import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { neutralizeCsvFormula, escapeCsvField, formatSafeExcelDigits } from '../lib/csv-sanitize'
import { generateReferralStudentDetailsCSV, REFERRAL_STUDENT_DETAILS_HEADERS } from '../lib/report-utils'

describe('csv-sanitize & report-utils', () => {
    it('neutralizes formula injection payloads while keeping signed numbers untouched', () => {
        assert.equal(neutralizeCsvFormula("=CMD|' /C calc'!A0"), "'=CMD|' /C calc'!A0")
        assert.equal(neutralizeCsvFormula('+1+1'), "'+1+1")
        assert.equal(neutralizeCsvFormula('-CMD()'), "'-CMD()")
        assert.equal(neutralizeCsvFormula('@SUM(A1:A5)'), "'@SUM(A1:A5)")
        assert.equal(neutralizeCsvFormula('\t=1+1'), "'\t=1+1")
        assert.equal(neutralizeCsvFormula('-150'), '-150')
        assert.equal(neutralizeCsvFormula('42.5'), '42.5')
        assert.equal(neutralizeCsvFormula('Line1\r\nLine2'), 'Line1 Line2')
    })

    it('escapes quotes per RFC 4180 and sanitizes Excel digit wrappers', () => {
        assert.equal(escapeCsvField(null), '""')
        assert.equal(escapeCsvField('Alice "Bob"'), '"Alice ""Bob"""')
        assert.equal(escapeCsvField('=2+2'), '"\'=2+2"')
        assert.equal(formatSafeExcelDigits('9876543210'), '="9876543210"')
        assert.equal(formatSafeExcelDigits('=1+1'), '"\'=1+1"')
    })

    it('generates 32-column CSV with neutralized cells and preserved financials', () => {
        const csv = generateReferralStudentDetailsCSV([
            {
                leadId: 42,
                academicYear: '2026-2027',
                parentName: '=HYPERLINK("http://evil.example","Click")',
                parentMobile: '9876543210',
                studentName: 'Jane "Ace" Doe',
                admissionNumber: 'ADM-01',
                gradeInterested: 'Grade-1',
                campus: 'ASM - Villianur',
                admissionFeeCollected: 10000,
                donationFeeCollected: 20000,
                annualFee: 60000,
                createdAt: new Date('2026-04-01T00:00:00Z'),
                confirmedDate: new Date('2026-04-02T00:00:00Z'),
                leadStatus: 'Confirmed',
                referralNumber: 1,
                slabPercent: 5,
                user: {
                    referralCode: 'ACH-P001',
                    fullName: 'Test Ambassador',
                    mobileNumber: '9999988888',
                    role: 'Parent',
                    assignedCampus: 'ASM - Villianur',
                    yearFeeBenefitPercent: 5,
                    bankName: '+cmd',
                    accountNumber: '123456789012',
                    ifscCode: 'FDRL0002514',
                },
            },
        ])

        const lines = csv.split('\n')
        assert.equal(lines.length, 2)
        assert.equal(REFERRAL_STUDENT_DETAILS_HEADERS.length, 32)
        assert.ok(lines[1].includes('"\'=HYPERLINK(""http://evil.example"",""Click"")"'))
        assert.ok(lines[1].includes('"Jane ""Ace"" Doe"'))
        assert.ok(lines[1].includes('="9876543210"'))
        assert.ok(lines[1].includes('"\'+cmd"'))
        assert.ok(lines[1].includes('"\'123456789012"'))
    })
})
