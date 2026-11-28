import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { deduplicateSettlements } from '../lib/settlement-utils'

describe('settlement-utils deduplicateSettlements', () => {
    it('keeps multi-row settlements inside the canonical UTR batch and drops duplicate re-upload batches', () => {
        const baseTime = new Date('2026-05-01T10:00:00Z').getTime()
        const input = [
            // Canonical UTR batch (2 rows created 5s apart)
            { id: 1, amount: 8000, status: 'Processed', bankReference: 'UTR123456', createdAt: new Date(baseTime) },
            { id: 2, amount: 10000, status: 'Processed', bankReference: 'utr123456 ', createdAt: new Date(baseTime + 5000) },
            // Duplicate CSV re-upload 5 minutes later with same UTR
            { id: 3, amount: 8000, status: 'Processed', bankReference: 'UTR123456', createdAt: new Date(baseTime + 5 * 60 * 1000) },
            // Non-processed and missing-UTR records preserved
            { id: 4, amount: 2500, status: 'Pending', bankReference: null, createdAt: new Date(baseTime + 10 * 60 * 1000) },
            { id: 5, amount: 3000, status: 'Processed', bankReference: '', createdAt: new Date(baseTime - 10000) },
        ]

        const result = deduplicateSettlements(input)
        const ids = result.map(r => r.id)

        assert.equal(result.length, 4)
        assert.ok(ids.includes(1))
        assert.ok(ids.includes(2))
        assert.ok(!ids.includes(3), 'duplicate UTR batch entry must be dropped')
        assert.ok(ids.includes(4))
        assert.ok(ids.includes(5))
        // Sorted newest first
        assert.equal(ids[0], 4)
    })
})
