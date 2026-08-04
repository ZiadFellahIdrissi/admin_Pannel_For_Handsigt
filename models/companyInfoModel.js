const pool = require('../config/db');

// Singleton row (id always 1, seeded by the migration in sql/schema.sql) -
// there's only ever one Handsight Solutions record, so this is fetched
// and updated in place, never listed/created/deleted like every other
// model in this app.

async function get() {
  const [rows] = await pool.query('SELECT * FROM company_info WHERE id = 1 LIMIT 1');
  return rows[0] || null;
}

async function update({
  ice, rc, patente, taxIdentifier, cnssNumber, legalForm, legalName,
  address, email, website, phone,
  bankName, bankAgency, bankRib, bankIban, bankSwift
}) {
  await pool.query(
    `UPDATE company_info SET
       ice = ?, rc = ?, patente = ?, tax_identifier = ?, cnss_number = ?,
       legal_form = ?, legal_name = ?, address = ?, email = ?, website = ?, phone = ?,
       bank_name = ?, bank_agency = ?, bank_rib = ?, bank_iban = ?, bank_swift = ?
     WHERE id = 1`,
    [
      ice, rc, patente, taxIdentifier, cnssNumber,
      legalForm, legalName, address, email, website, phone,
      bankName, bankAgency, bankRib, bankIban, bankSwift
    ]
  );
}

async function updateLogo(invoiceLogoPath) {
  await pool.query('UPDATE company_info SET invoice_logo_path = ? WHERE id = 1', [invoiceLogoPath]);
}

module.exports = { get, update, updateLogo };
