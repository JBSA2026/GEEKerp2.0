/**
 * PDF Export utility for the Reports Module.
 *
 * Uses jsPDF to generate a single-page (or multi-page) summary PDF
 * suitable for sharing report snapshots outside the ERP application.
 *
 * Usage:
 *   import { exportReportPdf } from '@/utils/pdfExport'
 *   exportReportPdf({
 *     title: 'Executive Overview',
 *     entity: 'Expedia',
 *     dateFrom: '2026-01-01',
 *     dateTo: '2026-07-16',
 *     sections: [
 *       { heading: 'Revenue', rows: [['Account', 'Amount'], ['Sales', '₱100,000']] },
 *     ],
 *     kpis: [{ label: 'Net Income', value: '₱1,000,000' }],
 *   })
 */
import { jsPDF } from 'jspdf'

const MARGIN = 20
const PAGE_WIDTH = 210 // A4 mm
const PAGE_HEIGHT = 297
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

/**
 * Export a report tab's current data as a PDF file.
 *
 * @param {Object} options
 * @param {string} options.title - Report tab title
 * @param {string} options.entity - Selected entity name
 * @param {string} options.dateFrom - Date range start (ISO)
 * @param {string} options.dateTo - Date range end (ISO)
 * @param {Array<{label: string, value: string}>} [options.kpis] - KPI cards
 * @param {Array<{heading: string, rows: string[][]}>} [options.sections] - Table sections (first row is header)
 */
export function exportReportPdf({ title, entity, dateFrom, dateTo, kpis, sections }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = MARGIN

  // Title
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(title, MARGIN, y)
  y += 8

  // Subtitle: entity + date range
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100)
  doc.text(`${entity} | ${dateFrom} to ${dateTo} | Generated ${new Date().toLocaleDateString()}`, MARGIN, y)
  doc.setTextColor(0)
  y += 10

  // Separator line
  doc.setDrawColor(200)
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
  y += 8

  // KPIs
  if (kpis && kpis.length > 0) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('KEY METRICS', MARGIN, y)
    y += 6

    const colWidth = CONTENT_WIDTH / Math.min(kpis.length, 4)
    for (let i = 0; i < kpis.length; i++) {
      const col = i % 4
      const row = Math.floor(i / 4)
      const x = MARGIN + col * colWidth
      const yPos = y + row * 14

      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100)
      doc.text(kpis[i].label, x, yPos)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0)
      doc.text(String(kpis[i].value ?? '—'), x, yPos + 5)
    }
    y += Math.ceil(kpis.length / 4) * 14 + 6
  }

  // Table sections
  if (sections && sections.length > 0) {
    for (const section of sections) {
      // Check if we need a new page
      if (y > PAGE_HEIGHT - 40) {
        doc.addPage()
        y = MARGIN
      }

      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text(section.heading, MARGIN, y)
      y += 5

      if (section.rows && section.rows.length > 0) {
        const colCount = section.rows[0].length
        const colW = CONTENT_WIDTH / colCount

        for (let ri = 0; ri < section.rows.length; ri++) {
          if (y > PAGE_HEIGHT - 15) {
            doc.addPage()
            y = MARGIN
          }

          const row = section.rows[ri]
          const isHeader = ri === 0

          doc.setFontSize(8)
          doc.setFont('helvetica', isHeader ? 'bold' : 'normal')
          if (isHeader) doc.setTextColor(80)
          else doc.setTextColor(0)

          for (let ci = 0; ci < row.length; ci++) {
            const x = MARGIN + ci * colW
            const text = String(row[ci] ?? '')
            // Right-align numeric-looking columns (not first column or header)
            if (ci > 0 && !isHeader && /^[₱\-\d]/.test(text)) {
              doc.text(text, x + colW - 2, y, { align: 'right' })
            } else {
              doc.text(text.substring(0, 40), x, y)
            }
          }
          y += 4.5
        }
        y += 4
      }
    }
  }

  // Footer
  const pageCount = doc.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(150)
    doc.text(`GEEK ERP — ${title} — ${entity} — Page ${p}/${pageCount}`, MARGIN, PAGE_HEIGHT - 10)
  }

  doc.save(`${title.replace(/\s+/g, '_').toLowerCase()}_${entity}_${dateFrom}_${dateTo}.pdf`)
}
