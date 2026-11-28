/**
 * CSV & Spreadsheet Formula Injection Protection Utilities
 * Safe for both client and server modules.
 */

const FORMULA_TRIGGER_REGEX = /^[=+\-@\t\r]/
const PLAIN_NUMBER_REGEX = /^[+-]?\d+(\.\d+)?$/

/**
 * Neutralizes spreadsheet formula injection (e.g. =CMD, +CMD, -CMD, @SUM)
 * on non-numeric strings while collapsing embedded line breaks.
 */
export function neutralizeCsvFormula(value: string): string {
    const collapsed = value.replace(/(\r\n|\n|\r)/gm, ' ')
    const trimmed = collapsed.trimStart()
    if (trimmed && FORMULA_TRIGGER_REGEX.test(trimmed) && !PLAIN_NUMBER_REGEX.test(trimmed)) {
        return `'${collapsed}`
    }
    return collapsed
}

/**
 * Safely quotes and escapes any string/number/date value for RFC 4180 CSV output.
 */
export function escapeCsvField(value: unknown): string {
    if (value === null || value === undefined) return '""'
    if (typeof value === 'number') {
        return Number.isFinite(value) ? String(value) : '""'
    }

    const safe = neutralizeCsvFormula(String(value))
    const escaped = safe.replace(/"/g, '""')
    return `"${escaped}"`
}

/**
 * Formats long identifiers (mobile numbers, UTRs) to prevent Excel scientific notation
 * ONLY when content is strictly alphanumeric/phone characters; otherwise neutralizes formulas.
 */
export function formatSafeExcelDigits(raw: unknown): string {
    if (raw === null || raw === undefined || raw === '') return '""'
    const clean = String(raw).replace(/[\r\n"\t]/g, '').trim()
    if (!clean) return '""'
    if (/^[A-Za-z0-9][A-Za-z0-9\s._-]*$/.test(clean)) {
        return `="${clean}"`
    }
    return escapeCsvField(clean)
}
