const pool = require('../config/db');

// Employees are normally only deactivated (`active = 0`), never deleted -
// a hard delete would orphan their salary_payments history. remove()
// below is only ever called after the controller has confirmed, via
// hasAnyPayments, that no payment record points at this employee.

// `active` is 1, 0, or undefined/null (no filter - list everyone).
async function list(active) {
  if (active === 1 || active === 0) {
    const [rows] = await pool.query(
      'SELECT * FROM employees WHERE active = ? ORDER BY last_name ASC, first_name ASC',
      [active]
    );
    return rows;
  }
  const [rows] = await pool.query('SELECT * FROM employees ORDER BY last_name ASC, first_name ASC');
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM employees WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function create({
  firstName, lastName, email, phone, jobTitle, netSalary, grossSalary,
  bankName, bankRib, bankIban, bankSwift
}) {
  const [result] = await pool.query(
    `INSERT INTO employees (
       first_name, last_name, active, email, phone, job_title, net_salary, gross_salary,
       bank_name, bank_rib, bank_iban, bank_swift
     ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      firstName, lastName, email || null, phone || null, jobTitle || null,
      netSalary ?? null, grossSalary ?? null,
      bankName || null, bankRib || null, bankIban || null, bankSwift || null
    ]
  );
  return result.insertId;
}

async function update(id, {
  firstName, lastName, email, phone, jobTitle, netSalary, grossSalary,
  bankName, bankRib, bankIban, bankSwift
}) {
  await pool.query(
    `UPDATE employees SET
       first_name = ?, last_name = ?, email = ?, phone = ?, job_title = ?, net_salary = ?, gross_salary = ?,
       bank_name = ?, bank_rib = ?, bank_iban = ?, bank_swift = ?
     WHERE id = ?`,
    [
      firstName, lastName, email || null, phone || null, jobTitle || null,
      netSalary ?? null, grossSalary ?? null,
      bankName || null, bankRib || null, bankIban || null, bankSwift || null,
      id
    ]
  );
}

async function setActive(id, active) {
  await pool.query('UPDATE employees SET active = ? WHERE id = ?', [active ? 1 : 0, id]);
}

async function hasAnyPayments(id) {
  const [rows] = await pool.query('SELECT id FROM salary_payments WHERE employee_id = ? LIMIT 1', [id]);
  return rows.length > 0;
}

// Only safe to call once the controller has verified there's nothing to
// orphan (see hasAnyPayments above).
async function remove(id) {
  await pool.query('DELETE FROM employees WHERE id = ?', [id]);
}

module.exports = { list, findById, create, update, setActive, hasAnyPayments, remove };
