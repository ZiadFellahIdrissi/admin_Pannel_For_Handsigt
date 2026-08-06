const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { COMPANY_LOGO_DIR } = require('../config/uploadPaths');

// Handsight's own brand tokens (see public/css/input.css :root) - reused
// here so the PDF actually looks like it belongs to the same product as
// the panel around it, instead of a generic black-and-white document.
const COLOR_ACCENT = '#1a6eff';
const COLOR_ACCENT_DARK = '#0d1628';
const COLOR_TEXT = '#1f2937';
const COLOR_MUTED = '#6b7280';
const COLOR_BORDER = '#dbe3ee';
const COLOR_BG_SOFT = '#f4f7fc';
const COLOR_BG_CHIP = '#eaf1ff';
const COLOR_WHITE = '#ffffff';

const PAGE_MARGIN = 50;
const PAGE_RIGHT = 545; // A4 width (595.28) minus the right margin

function money(n) {
  return `${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;
}

// company_info.invoice_logo_path is a full public URL (see
// settingsController.js) - the actual file, for pdfkit's own use, is
// just its last path segment, inside COMPANY_LOGO_DIR on this same
// server's filesystem.
function resolveLogoPath(invoiceLogoPath) {
  if (!invoiceLogoPath) return null;
  const filePath = path.join(COMPANY_LOGO_DIR, invoiceLogoPath.split('/').pop());
  return fs.existsSync(filePath) ? filePath : null;
}

// Filled (and optionally bordered) rounded rectangle - always leaves
// doc's fill color reset to the default body text color afterwards, so
// callers never have to remember to restore it themselves.
function panel(doc, x, y, w, h, fillColor, options) {
  const radius = (options && options.radius) || 6;
  doc.roundedRect(x, y, w, h, radius).fill(fillColor);
  if (options && options.border) {
    doc.roundedRect(x, y, w, h, radius).lineWidth(1).stroke(options.border);
  }
  doc.fillColor(COLOR_TEXT);
}

// One "party" card - a heading in accent color, the name in bold, then
// whatever address/ICE/RC/contact lines are available underneath.
function partyBlock(doc, x, y, width, heading, party) {
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_ACCENT)
    .text(heading.toUpperCase(), x, y, { width, characterSpacing: 0.4 });

  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(COLOR_TEXT)
    .text(party.name || '—', x, doc.y + 6, { width });

  doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_MUTED);
  [
    party.address,
    party.ice ? `ICE : ${party.ice}` : null,
    party.rc ? `RC : ${party.rc}` : null,
    party.email,
    party.phone
  ].filter(Boolean).forEach((line) => {
    doc.text(line, x, doc.y + 2, { width });
  });
}

// data: { type: 'client'|'supplier', invoiceNumber, dateLabel, monthLabel,
//         company (company_info row), party ({ name, ice, rc, address,
//         email, phone } - client row for type client, just { name } for
//         type supplier since consultants have no legal/business fields),
//         label, totalDays, rate, totalHt, totalTva, totalTtc }
function generateInvoicePdf(data, destinationPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });
    const stream = fs.createWriteStream(destinationPath);
    doc.pipe(stream);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.on('error', reject);

    const { company } = data;
    const logoPath = resolveLogoPath(company.invoice_logo_path);

    // --- Header: logo + Handsight's own letterhead block --------------
    const headerTop = 50;
    if (logoPath) {
      try {
        doc.image(logoPath, PAGE_MARGIN, headerTop, { height: 42 });
      } catch {
        // Corrupt/unreadable image file - skip it, don't fail the whole PDF.
      }
    } else {
      doc.font('Helvetica-Bold').fontSize(15).fillColor(COLOR_ACCENT_DARK)
        .text(company.legal_name || 'Handsight Solutions', PAGE_MARGIN, headerTop);
    }

    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR_ACCENT_DARK)
      .text(company.legal_name || 'Handsight Solutions', 300, headerTop, { width: 245, align: 'right' });
    doc.font('Helvetica').fontSize(8).fillColor(COLOR_MUTED);
    [
      company.address,
      [company.ice ? `ICE ${company.ice}` : null, company.rc ? `RC ${company.rc}` : null].filter(Boolean).join('   ') || null,
      company.email,
      company.phone
    ].filter(Boolean).forEach((line) => {
      doc.text(line, 300, doc.y + 2, { width: 245, align: 'right' });
    });

    const headerBottom = Math.max(headerTop + 46, doc.y + 10);
    doc.moveTo(PAGE_MARGIN, headerBottom).lineTo(PAGE_RIGHT, headerBottom)
      .lineWidth(1.5).strokeColor(COLOR_ACCENT).stroke();

    // --- Title + metadata, with a total-due chip on the right ---------
    const titleY = headerBottom + 22;
    doc.font('Helvetica-Bold').fontSize(24).fillColor(COLOR_ACCENT_DARK).text('FACTURE', PAGE_MARGIN, titleY);

    const metaY = titleY + 36;
    doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_MUTED).text('N° DE FACTURE', PAGE_MARGIN, metaY, { characterSpacing: 0.3 });
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(COLOR_TEXT).text(data.invoiceNumber, PAGE_MARGIN, metaY + 11);
    doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_MUTED).text(`Date d'émission : ${data.dateLabel}`, PAGE_MARGIN, metaY + 30);
    doc.text(`Période concernée : ${data.monthLabel}`, PAGE_MARGIN, metaY + 43);

    const chipW = 190;
    const chipH = 58;
    const chipX = PAGE_RIGHT - chipW;
    const chipY = titleY - 4;
    panel(doc, chipX, chipY, chipW, chipH, COLOR_BG_CHIP);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_ACCENT_DARK)
      .text('MONTANT TOTAL TTC', chipX, chipY + 13, { width: chipW, align: 'center', characterSpacing: 0.4 });
    doc.font('Helvetica-Bold').fontSize(19).fillColor(COLOR_ACCENT)
      .text(money(data.totalTtc), chipX, chipY + 28, { width: chipW, align: 'center' });

    // --- Party cards - "Émetteur" / "Facturé à" flip by invoice type --
    const partyY = metaY + 68;
    const partyH = 110;
    const colW = (PAGE_RIGHT - PAGE_MARGIN - 20) / 2;
    const issuer = data.type === 'client'
      ? { name: company.legal_name, address: company.address, ice: company.ice, rc: company.rc, email: company.email, phone: company.phone }
      : { name: data.party.name };
    const recipient = data.type === 'client'
      ? data.party
      : { name: company.legal_name, address: company.address, ice: company.ice, rc: company.rc, email: company.email, phone: company.phone };

    panel(doc, PAGE_MARGIN, partyY, colW, partyH, COLOR_BG_SOFT);
    panel(doc, PAGE_MARGIN + colW + 20, partyY, colW, partyH, COLOR_BG_SOFT);
    partyBlock(doc, PAGE_MARGIN + 14, partyY + 14, colW - 28, 'Émetteur', issuer);
    partyBlock(doc, PAGE_MARGIN + colW + 20 + 14, partyY + 14, colW - 28, 'Facturé à', recipient);

    // --- Line item table ------------------------------------------------
    // Numeric columns are right-aligned (each defined by its own x/width
    // pair) so amounts of any size line up cleanly against the page edge
    // instead of risking an overflow-wrap on a wide total.
    const tableY = partyY + partyH + 26;
    const col = {
      desc: { x: PAGE_MARGIN + 14, width: 240 },
      qte: { x: 320, width: 55 },
      pu: { x: 385, width: 75 },
      montant: { x: 470, width: 75 }
    };
    const tableHeaderH = 26;
    panel(doc, PAGE_MARGIN, tableY, PAGE_RIGHT - PAGE_MARGIN, tableHeaderH, COLOR_ACCENT_DARK, { radius: 5 });
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_WHITE);
    doc.text('DESCRIPTION', col.desc.x, tableY + 9, { width: col.desc.width });
    doc.text('QTÉ (J)', col.qte.x, tableY + 9, { width: col.qte.width, align: 'right' });
    doc.text('PU HT', col.pu.x, tableY + 9, { width: col.pu.width, align: 'right' });
    doc.text('MONTANT HT', col.montant.x, tableY + 9, { width: col.montant.width, align: 'right' });

    const rowY = tableY + tableHeaderH;
    const rowH = 36;
    doc.rect(PAGE_MARGIN, rowY, PAGE_RIGHT - PAGE_MARGIN, rowH).lineWidth(1).strokeColor(COLOR_BORDER).stroke();
    doc.font('Helvetica').fontSize(9).fillColor(COLOR_TEXT);
    doc.text(data.label, col.desc.x, rowY + 12, { width: col.desc.width });
    doc.text(String(data.totalDays), col.qte.x, rowY + 12, { width: col.qte.width, align: 'right' });
    doc.text(money(data.rate), col.pu.x, rowY + 12, { width: col.pu.width, align: 'right' });
    doc.font('Helvetica-Bold').text(money(data.totalHt), col.montant.x, rowY + 12, { width: col.montant.width, align: 'right' });

    // --- Totals card -----------------------------------------------------
    const totalsW = 220;
    const totalsX = PAGE_RIGHT - totalsW;
    const totalsY = rowY + rowH + 20;
    const totalsH = 96;
    panel(doc, totalsX, totalsY, totalsW, totalsH, COLOR_BG_SOFT, { border: COLOR_BORDER });

    doc.font('Helvetica').fontSize(9).fillColor(COLOR_MUTED).text('Total HT', totalsX + 16, totalsY + 16);
    doc.font('Helvetica').fontSize(9).fillColor(COLOR_TEXT).text(money(data.totalHt), totalsX, totalsY + 16, { width: totalsW - 16, align: 'right' });

    doc.font('Helvetica').fontSize(9).fillColor(COLOR_MUTED).text('TVA (20%)', totalsX + 16, totalsY + 36);
    doc.font('Helvetica').fontSize(9).fillColor(COLOR_TEXT).text(money(data.totalTva), totalsX, totalsY + 36, { width: totalsW - 16, align: 'right' });

    doc.moveTo(totalsX + 16, totalsY + 60).lineTo(totalsX + totalsW - 16, totalsY + 60)
      .lineWidth(1).strokeColor(COLOR_BORDER).stroke();

    doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_ACCENT_DARK).text('Total TTC', totalsX + 16, totalsY + 71);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(COLOR_ACCENT).text(money(data.totalTtc), totalsX, totalsY + 69, { width: totalsW - 16, align: 'right' });

    // --- Footer: bank details + legal mention ----------------------------
    const footerY = totalsY + totalsH + 26;
    doc.moveTo(PAGE_MARGIN, footerY).lineTo(PAGE_RIGHT, footerY).lineWidth(0.75).strokeColor(COLOR_BORDER).stroke();

    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_ACCENT_DARK)
      .text('COORDONNÉES BANCAIRES', PAGE_MARGIN, footerY + 14, { characterSpacing: 0.3 });

    const bankLines = [
      company.bank_name ? `Banque : ${company.bank_name}` : null,
      company.bank_agency ? `Agence : ${company.bank_agency}` : null,
      company.bank_rib ? `RIB : ${company.bank_rib}` : null,
      company.bank_iban ? `IBAN : ${company.bank_iban}` : null,
      company.bank_swift ? `BIC/SWIFT : ${company.bank_swift}` : null
    ].filter(Boolean);

    const bankY = footerY + 28;
    doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_MUTED);
    bankLines.forEach((line, i) => {
      const colX = PAGE_MARGIN + (i % 2) * 250;
      const colY = bankY + Math.floor(i / 2) * 14;
      doc.text(line, colX, colY, { width: 230 });
    });

    const legalY = bankY + Math.ceil(bankLines.length / 2) * 14 + 18;
    doc.font('Helvetica').fontSize(7.5).fillColor(COLOR_MUTED).text(
      [
        company.legal_name,
        company.ice ? `ICE ${company.ice}` : null,
        company.rc ? `RC ${company.rc}` : null,
        company.tax_identifier ? `IF ${company.tax_identifier}` : null
      ].filter(Boolean).join('   ·   '),
      PAGE_MARGIN, legalY, { width: PAGE_RIGHT - PAGE_MARGIN, align: 'center' }
    );

    doc.end();
  });
}

module.exports = { generateInvoicePdf };
