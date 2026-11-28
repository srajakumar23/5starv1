import { format } from 'date-fns'
import { toast } from 'sonner'
import { escapeCsvField, neutralizeCsvFormula } from './csv-sanitize'

export function exportToCSV(data: any[], filename: string, columns: { header: string, maxLen?: number, accessor?: (row: any) => any, forceString?: boolean }[]) {
    if (!data || data.length === 0) {
        toast.error("No data to export.")
        return
    }

    // Extract headers
    const headers = columns.map(c => escapeCsvField(c.header)).join(',')

    // Extract rows
    const csvRows: string[] = [headers]
    
    data.forEach(row => {
        const rowContent = columns.map(c => {
            let val = c.accessor ? c.accessor(row) : ''

            // Handle null/undefined
            if (val === null || val === undefined) val = ''

            // Convert dates if generic (though accessor usually handles format)
            if (val instanceof Date) val = format(val, 'yyyy-MM-dd')

            const rawStr = String(val).replace(/(\r\n|\n|\r)/gm, " ")

            // Permanent Solution for Scientific Notation:
            // If forceString is true or if it's a long numeric string (Mobile/UTR),
            // only wrap safe non-formula alphanumerics/digits in ="\tVAL"
            const looksLikeLongNumber = /^\d{10,}$/.test(rawStr.trim())
            if ((c.forceString || looksLikeLongNumber) && rawStr.trim() !== '') {
                const safeToken = rawStr.replace(/["\t]/g, '').trim()
                if (/^[A-Za-z0-9][A-Za-z0-9\s._\-/]*$/.test(safeToken)) {
                    return `="\t${safeToken}"`
                }
            }

            const safe = neutralizeCsvFormula(rawStr)
            if (safe.includes(',') || safe.includes('"') || safe !== rawStr) {
                return `"${safe.replace(/"/g, '""')}"`
            }
            return safe
        }).join(',')
        csvRows.push(rowContent)
    })

    const csvContent = csvRows.join("\n")
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", `${filename}_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`)
    
    // Append to body to ensure it works in all browsers
    document.body.appendChild(link)
    link.click()
    
    // Cleanup
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}
