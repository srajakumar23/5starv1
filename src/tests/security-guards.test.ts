import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { safeSecretEquals, verifyBearerSecret } from '../lib/secret-compare'
import { isIpWhitelisted } from '../lib/security'
import { encryptReferralCode, decryptReferralCode } from '../lib/crypto'

describe('security guards & crypto utilities', () => {
    it('fails closed on missing or mismatched secrets in safeSecretEquals and verifyBearerSecret', () => {
        assert.equal(safeSecretEquals(undefined, 'secret'), false)
        assert.equal(safeSecretEquals('secret', undefined), false)
        assert.equal(safeSecretEquals('', ''), false)
        assert.equal(safeSecretEquals('short', 'different-length'), false)
        assert.equal(safeSecretEquals('secretA', 'secretB'), false)
        assert.equal(safeSecretEquals('super-secret-123', 'super-secret-123'), true)

        const authedReq = new Request('https://example.com/api/cron', {
            headers: { authorization: 'Bearer cron-token-xyz' },
        })
        const badReq = new Request('https://example.com/api/cron', {
            headers: { authorization: 'Bearer wrong-token' },
        })

        assert.equal(verifyBearerSecret(authedReq, undefined), false)
        assert.equal(verifyBearerSecret(badReq, 'cron-token-xyz'), false)
        assert.equal(verifyBearerSecret(authedReq, 'cron-token-xyz'), true)
    })

    it('enforces IP whitelist including localhost allowance', () => {
        assert.equal(isIpWhitelisted('203.0.113.10', null), true)
        assert.equal(isIpWhitelisted('203.0.113.10', '203.0.113.10, 198.51.100.5'), true)
        assert.equal(isIpWhitelisted('127.0.0.1', '203.0.113.10'), true)
        assert.equal(isIpWhitelisted('::1', '203.0.113.10'), true)
        assert.equal(isIpWhitelisted('203.0.113.99', '203.0.113.10, 198.51.100.5'), false)
    })

    it('round-trips referral code obfuscation cleanly', () => {
        const code = 'ACH-P0421'
        const encrypted = encryptReferralCode(code)
        assert.notEqual(encrypted, code)
        assert.equal(decryptReferralCode(encrypted), code)
    })

    it('encrypts and decrypts PII with AES-256-GCM and preserves legacy plaintext', async () => {
        process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef'
        const { encrypt, decrypt } = await import('../lib/encryption')

        const secret = '25140100003941'
        const c1 = encrypt(secret)
        const c2 = encrypt(secret)

        assert.ok(c1 && c1.includes(':'))
        assert.notEqual(c1, c2, 'each AES-GCM encryption should use a fresh random IV')
        assert.equal(decrypt(c1), secret)
        assert.equal(decrypt(c2), secret)
        assert.equal(decrypt('LEGACY_PLAINTEXT_VALUE'), 'LEGACY_PLAINTEXT_VALUE')
        assert.equal(decrypt(null), null)
    })
})
