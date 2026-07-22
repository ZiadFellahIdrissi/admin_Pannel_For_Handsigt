const pool = require('../config/db');

// Clients are normally only deactivated (`active = 0`), never deleted -
// a hard delete would cascade-destroy consultant_clients/month_submissions
// history via the existing FK constraints. remove() below is only ever
// called after the controller has confirmed, via hasAnyAttachments/
// hasAnySubmissions, that there is nothing to cascade-destroy.

// `active` is 1, 0, or undefined/null (no filter - list every client).
async function list(active) {
  if (active === 1 || active === 0) {
    const [rows] = await pool.query(
      'SELECT * FROM clients WHERE active = ? ORDER BY name ASC',
      [active]
    );
    return rows;
  }
  const [rows] = await pool.query('SELECT * FROM clients ORDER BY name ASC');
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM clients WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function create({
  name,
  ice, rc, rcCity, patente, taxIdentifier, cnssNumber, legalForm, registeredCapital, registeredAddress,
  contactName, contactTitle, contactPhone, contactEmail,
  bankName, bankRib, bankIban, bankSwift,
  companyPhone, companyEmail, website, billingAddress, paymentTerms, notes
}) {
  const [result] = await pool.query(
    `INSERT INTO clients (
       name, active,
       ice, rc, rc_city, patente, tax_identifier, cnss_number, legal_form, registered_capital, registered_address,
       contact_name, contact_title, contact_phone, contact_email,
       bank_name, bank_rib, bank_iban, bank_swift,
       company_phone, company_email, website, billing_address, payment_terms, notes
     ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      ice || null, rc || null, rcCity || null, patente || null, taxIdentifier || null, cnssNumber || null,
      legalForm || null, registeredCapital || null, registeredAddress || null,
      contactName || null, contactTitle || null, contactPhone || null, contactEmail || null,
      bankName || null, bankRib || null, bankIban || null, bankSwift || null,
      companyPhone || null, companyEmail || null, website || null, billingAddress || null, paymentTerms || null, notes || null
    ]
  );
  return result.insertId;
}

async function update(id, {
  name,
  ice, rc, rcCity, patente, taxIdentifier, cnssNumber, legalForm, registeredCapital, registeredAddress,
  contactName, contactTitle, contactPhone, contactEmail,
  bankName, bankRib, bankIban, bankSwift,
  companyPhone, companyEmail, website, billingAddress, paymentTerms, notes
}) {
  await pool.query(
    `UPDATE clients SET
       name = ?,
       ice = ?, rc = ?, rc_city = ?, patente = ?, tax_identifier = ?, cnss_number = ?,
       legal_form = ?, registered_capital = ?, registered_address = ?,
       contact_name = ?, contact_title = ?, contact_phone = ?, contact_email = ?,
       bank_name = ?, bank_rib = ?, bank_iban = ?, bank_swift = ?,
       company_phone = ?, company_email = ?, website = ?, billing_address = ?, payment_terms = ?, notes = ?
     WHERE id = ?`,
    [
      name,
      ice || null, rc || null, rcCity || null, patente || null, taxIdentifier || null, cnssNumber || null,
      legalForm || null, registeredCapital || null, registeredAddress || null,
      contactName || null, contactTitle || null, contactPhone || null, contactEmail || null,
      bankName || null, bankRib || null, bankIban || null, bankSwift || null,
      companyPhone || null, companyEmail || null, website || null, billingAddress || null, paymentTerms || null, notes || null,
      id
    ]
  );
}

async function setActive(id, active) {
  await pool.query('UPDATE clients SET active = ? WHERE id = ?', [active ? 1 : 0, id]);
}

async function hasAnyAttachments(id) {
  const [rows] = await pool.query(
    'SELECT id FROM consultant_clients WHERE client_id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0;
}

async function hasAnySubmissions(id) {
  const [rows] = await pool.query(
    'SELECT id FROM month_submissions WHERE client_id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0;
}

// Only safe to call once the controller has verified there's nothing to
// cascade-destroy (see hasAnyAttachments/hasAnySubmissions above).
async function remove(id) {
  await pool.query('DELETE FROM clients WHERE id = ?', [id]);
}

module.exports = { list, findById, create, update, setActive, hasAnyAttachments, hasAnySubmissions, remove };
