const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { COMPANY_LOGO_DIR } = require('../config/uploadPaths');

// Handsight's own brand tokens (see public/css/input.css :root), plus a
// couple of PDF-only neutrals - reused so the invoice actually looks like
// it belongs to the same product, modeled on the company's existing
// Canva invoice template (logo card, dark navy header, totals block).
const COLOR_NAVY = '#0d1628';
const COLOR_BLUE = '#1a6eff';
const COLOR_BLUE_BG = '#eaf1ff';
const COLOR_TEXT = '#1f2937';
const COLOR_MUTED = '#6b7280';
const COLOR_BORDER = '#dde2ea';
const COLOR_BAND_BG = '#f1f3f6';
const COLOR_CARD_LABEL = '#9db3d6';
const COLOR_PARTY_BG = '#e7ecf5';
const COLOR_WHITE = '#ffffff';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;
const RIGHT = 545;

// Node's toLocaleString('fr-FR') groups thousands with a narrow no-break
// space (U+202F). pdfkit's standard fonts only support WinAnsiEncoding,
// which has no glyph for that character, so it silently falls back to
// whatever WinAnsi happens to map to that byte - a stray "/" in this
// font. Formatting by hand with a plain ASCII space sidesteps that
// entirely. Also matches the company's own template, which uses "DH".
function formatAmount(n) {
  const fixed = (Number(n) || 0).toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped},${decPart}`;
}

function money(n) {
  return `${formatAmount(n)} DH`;
}

// --- French "amount in words" (Moroccan invoice convention) ------------

const ONES = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

function tensToWords(n) {
  if (n < 20) return ONES[n];
  if (n < 70) {
    const tens = Math.floor(n / 10);
    const unit = n % 10;
    if (unit === 0) return TENS[tens];
    if (unit === 1) return `${TENS[tens]} et un`;
    return `${TENS[tens]}-${ONES[unit]}`;
  }
  if (n < 80) {
    return n === 71 ? 'soixante et onze' : `soixante-${ONES[n - 60]}`;
  }
  if (n === 80) return 'quatre-vingts';
  return `quatre-vingt-${ONES[n - 80]}`;
}

function hundredsToWords(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  let words = '';
  if (h > 0) {
    words = h === 1 ? 'cent' : `${ONES[h]} cent`;
    if (h > 1 && rest === 0) words += 's';
  }
  if (rest > 0) words += (words ? ' ' : '') + tensToWords(rest);
  return words;
}

function numberToFrenchWords(n) {
  const value = Math.floor(n);
  if (value === 0) return 'zéro';

  const millions = Math.floor(value / 1000000);
  const thousands = Math.floor((value % 1000000) / 1000);
  const rest = value % 1000;
  const parts = [];

  if (millions > 0) parts.push(millions === 1 ? 'un million' : `${hundredsToWords(millions)} millions`);
  if (thousands > 0) parts.push(thousands === 1 ? 'mille' : `${hundredsToWords(thousands)} mille`);
  if (rest > 0) parts.push(hundredsToWords(rest));

  return parts.join(' ');
}

function amountInWords(totalTtc) {
  const wholePart = Math.floor(totalTtc);
  const cents = Math.round((totalTtc - wholePart) * 100);
  let words = numberToFrenchWords(wholePart);
  words = words.charAt(0).toUpperCase() + words.slice(1);
  words += ' dirhams';
  if (cents > 0) {
    words += ` et ${numberToFrenchWords(cents)} centime${cents > 1 ? 's' : ''}`;
  }
  return `${words} (${money(totalTtc)}).`;
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

function sectionHeading(doc, x, y, width, text) {
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_NAVY)
    .text(text, x, y, { width, characterSpacing: 0.3 });
  const ruleY = doc.y + 4;
  doc.moveTo(x, ruleY).lineTo(x + 34, ruleY).lineWidth(2).strokeColor(COLOR_BLUE).stroke();
  return ruleY + 10;
}

// data: { type: 'client'|'supplier', invoiceNumber, dateLabel, monthLabel,
//         company (company_info row), party ({ name, ice, rc, address,
//         email, phone } - client row for type client, just { name } for
//         type supplier since consultants have no legal/business fields),
//         label, totalDays, rate, totalHt, totalTva, totalTtc }
function generateInvoicePdf(data, destinationPath) {
  return new Promise((resolve, reject) => {
    // Every element in this document is placed at explicit x/y coordinates
    // (never relying on pdfkit's automatic cursor-based flow), but pdfkit
    // still auto-inserts a page break whenever a text call's computed
    // bottom would cross the document's own bottom margin - regardless of
    // whether we ever asked it to flow anything there. With the default
    // 50pt margin, that boundary sat right in the middle of the footer
    // band, splitting its two lines across two pages. Margins are set to 0
    // here since we already guarantee everything stays within PAGE_H by
    // construction (the footer band itself is anchored a fixed offset
    // above the physical page bottom).
    const doc = new PDFDocument({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    const stream = fs.createWriteStream(destinationPath);
    doc.pipe(stream);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.on('error', reject);

    const { company } = data;
    const logoPath = resolveLogoPath(company.invoice_logo_path);

    // --- Top band: logo + letterhead on the left, dark info card on the right
    const TOP_BAND_H = 280;
    doc.rect(0, 0, PAGE_W, TOP_BAND_H).fill(COLOR_BAND_BG);
    doc.fillColor(COLOR_TEXT);

    const LOGO_Y = 42;
    if (logoPath) {
      try {
        doc.image(logoPath, MARGIN, LOGO_Y, { height: 46 });
      } catch {
        // Corrupt/unreadable image file - skip it, don't fail the whole PDF.
      }
    } else {
      doc.font('Helvetica-Bold').fontSize(15).fillColor(COLOR_NAVY)
        .text(company.legal_name || 'Handsight Solutions', MARGIN, LOGO_Y);
    }

    const companyY = LOGO_Y + 46 + 14;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_NAVY)
      .text(company.legal_name || 'Handsight Solutions', MARGIN, companyY, { width: 260 });
    doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_MUTED);
    [
      company.address,
      company.phone ? `TEL : ${company.phone}` : null,
      company.email,
      company.website
    ].filter(Boolean).forEach((line) => {
      doc.text(line, MARGIN, doc.y + 3, { width: 260 });
    });

    // Dark navy info card, top-right - invoice number/date plus a nested
    // light party card ("Facturé à" for client invoices, "Fournisseur"
    // for supplier ones, flipping which side of the deal is named here).
    const CARD_X = 335;
    const CARD_W = RIGHT - CARD_X;
    const CARD_Y = 42;
    const CARD_H = 230;
    panel(doc, CARD_X, CARD_Y, CARD_W, CARD_H, COLOR_NAVY, { radius: 10 });

    const innerX = CARD_X + 16;
    const innerW = CARD_W - 32;
    doc.font('Helvetica-Bold').fontSize(20).fillColor(COLOR_WHITE).text('FACTURE', innerX, CARD_Y + 16);

    const row1Y = CARD_Y + 54;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLOR_CARD_LABEL)
      .text('N° FACTURE', innerX, row1Y, { width: 80, characterSpacing: 0.3 });
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR_WHITE)
      .text(data.invoiceNumber, innerX, row1Y, { width: innerW, align: 'right' });

    const row2Y = row1Y + 20;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLOR_CARD_LABEL)
      .text('DATE', innerX, row2Y, { width: 80, characterSpacing: 0.3 });
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR_WHITE)
      .text(data.dateLabel, innerX, row2Y, { width: innerW, align: 'right' });

    const row3Y = row2Y + 20;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLOR_CARD_LABEL)
      .text('PÉRIODE', innerX, row3Y, { width: 80, characterSpacing: 0.3 });
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR_WHITE)
      .text(data.monthLabel, innerX, row3Y, { width: innerW, align: 'right' });

    const partyBoxY = row3Y + 30;
    const partyBoxH = (CARD_Y + CARD_H) - partyBoxY - 14;
    panel(doc, innerX - 4, partyBoxY, innerW + 8, partyBoxH, COLOR_PARTY_BG, { radius: 6 });
    const partyHeading = data.type === 'client' ? 'FACTURÉ À' : 'FOURNISSEUR';
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_NAVY)
      .text(partyHeading, innerX, partyBoxY + 12, { width: innerW - 8, characterSpacing: 0.3 });
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(COLOR_TEXT)
      .text(data.party.name || '—', innerX, doc.y + 6, { width: innerW - 8 });
    doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_MUTED);
    [
      data.party.address,
      data.party.ice ? `ICE : ${data.party.ice}` : null,
      data.party.rc ? `RC : ${data.party.rc}` : null
    ].filter(Boolean).forEach((line) => {
      doc.text(line, innerX, doc.y + 4, { width: innerW - 8 });
    });

    // --- Line item table -------------------------------------------------
    // Header + body are drawn as flat-edged fills clipped to one shared
    // rounded-rect silhouette, so the navy header sits flush against the
    // body row below instead of showing its own (independently) rounded
    // bottom corners floating above a separately-rounded row.
    const tableY = TOP_BAND_H + 20;
    const headerH = 36;
    const rowH = 46;
    const tableH = headerH + rowH;
    const tableRadius = 8;

    // Evenly-gapped column grid - each entry is the full cell (border to
    // border); text is inset from those bounds per-column below so the
    // numeric columns get consistent left/right breathing room instead of
    // crowding the divider.
    const col = {
      desc: { x: MARGIN, width: 220 },
      qte: { x: MARGIN + 220, width: 70 },
      pu: { x: MARGIN + 290, width: 90 },
      montant: { x: MARGIN + 380, width: 115 }
    };

    doc.save();
    doc.roundedRect(MARGIN, tableY, RIGHT - MARGIN, tableH, tableRadius).clip();
    doc.rect(MARGIN, tableY, RIGHT - MARGIN, headerH).fill(COLOR_NAVY);
    doc.rect(MARGIN, tableY + headerH, RIGHT - MARGIN, rowH).fill(COLOR_WHITE);
    doc.restore();
    doc.roundedRect(MARGIN, tableY, RIGHT - MARGIN, tableH, tableRadius)
      .lineWidth(1).strokeColor(COLOR_BORDER).stroke();
    doc.fillColor(COLOR_TEXT);

    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_WHITE);
    doc.text('DÉSIGNATION', col.desc.x + 16, tableY + 14, { width: col.desc.width - 22 });
    doc.text('QTÉ\n(JOURS)', col.qte.x, tableY + 8, { width: col.qte.width, align: 'center', lineGap: 1 });
    doc.text('PRIX UNIT.\n(HT)', col.pu.x, tableY + 8, { width: col.pu.width - 16, align: 'right', lineGap: 1 });
    doc.text('MONTANT\n(HT)', col.montant.x, tableY + 8, { width: col.montant.width - 18, align: 'right', lineGap: 1 });

    const rowY = tableY + headerH;
    doc.font('Helvetica').fontSize(9).fillColor(COLOR_TEXT);
    doc.text(data.label, col.desc.x + 16, rowY + 17, { width: col.desc.width - 22 });
    doc.text(String(data.totalDays), col.qte.x, rowY + 17, { width: col.qte.width, align: 'center' });
    doc.text(money(data.rate), col.pu.x, rowY + 17, { width: col.pu.width - 16, align: 'right' });
    doc.font('Helvetica-Bold').text(money(data.totalHt), col.montant.x, rowY + 17, { width: col.montant.width - 18, align: 'right' });

    // Faint column dividers, body row only - the header needs none of its
    // own (the navy fill against white labels already reads as one block).
    doc.strokeColor(COLOR_BORDER).lineWidth(0.5);
    [col.qte.x, col.pu.x, col.montant.x].forEach((x) => {
      doc.moveTo(x, rowY).lineTo(x, rowY + rowH).stroke();
    });

    // --- Amount in words (left) + totals mini-table (right) --------------
    const sectionY = tableY + tableH + 24;

    const leftX = MARGIN;
    const leftW = 260;
    const wordsBoxY = sectionHeading(doc, leftX, sectionY, leftW, 'ARRÊTÉE LA PRÉSENTE FACTURE À LA SOMME DE :');
    const wordsBoxH = 52;
    panel(doc, leftX, wordsBoxY, leftW, wordsBoxH, COLOR_BAND_BG, { border: COLOR_BORDER });
    doc.font('Helvetica').fontSize(9).fillColor(COLOR_TEXT)
      .text(amountInWords(data.totalTtc), leftX + 12, wordsBoxY + 12, { width: leftW - 24 });

    const rightX = CARD_X;
    const rightW = CARD_W;
    const totalsRowH = 30;
    const totalsGap = 5;
    const labelW = Math.round(rightW * 0.55);
    const valueW = rightW - labelW - 3;
    const totalsRows = [
      { label: 'TOTAL HT', value: money(data.totalHt), highlight: false },
      { label: 'TVA (20%)', value: money(data.totalTva), highlight: false },
      { label: 'TOTAL TTC', value: money(data.totalTtc), highlight: true }
    ];
    totalsRows.forEach((row, i) => {
      const y = sectionY + i * (totalsRowH + totalsGap);
      const labelBg = row.highlight ? COLOR_NAVY : COLOR_BAND_BG;
      const valueBg = row.highlight ? COLOR_BLUE_BG : COLOR_BAND_BG;
      const labelColor = row.highlight ? COLOR_WHITE : COLOR_NAVY;
      const valueColor = row.highlight ? COLOR_BLUE : COLOR_TEXT;

      panel(doc, rightX, y, labelW, totalsRowH, labelBg);
      panel(doc, rightX + labelW + 3, y, valueW, totalsRowH, valueBg);

      doc.font('Helvetica-Bold').fontSize(row.highlight ? 9.5 : 9).fillColor(labelColor)
        .text(row.label, rightX + 12, y + 10, { width: labelW - 20 });
      doc.font('Helvetica-Bold').fontSize(row.highlight ? 11 : 9).fillColor(valueColor)
        .text(row.value, rightX + labelW + 3, y + (row.highlight ? 9 : 10), { width: valueW - 12, align: 'right' });
    });

    // --- Footer band, anchored flush to the bottom of the page --------------
    const FOOTER_H = 42;
    const footerY = PAGE_H - FOOTER_H;
    doc.rect(0, footerY, PAGE_W, FOOTER_H).fill(COLOR_BAND_BG);

    const addressLine = [company.legal_name, company.address].filter(Boolean).join(' : ');
    doc.font('Helvetica').fontSize(7).fillColor(COLOR_MUTED)
      .text(addressLine, MARGIN, footerY + 10, { width: RIGHT - MARGIN, align: 'center' });

    const legalLine = [
      company.ice ? `ICE : ${company.ice}` : null,
      company.rc ? `R.C : ${company.rc}` : null,
      company.patente ? `TP : ${company.patente}` : null,
      company.tax_identifier ? `I.F : ${company.tax_identifier}` : null
    ].filter(Boolean).join('   -   ');
    doc.font('Helvetica-Bold').fontSize(7).fillColor(COLOR_NAVY)
      .text(legalLine, MARGIN, footerY + 24, { width: RIGHT - MARGIN, align: 'center' });

    doc.end();
  });
}

module.exports = { generateInvoicePdf };
