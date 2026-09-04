const pool = require('../config/db');

// The Salaries page's core view: every active employee for one month,
// LEFT JOINed to their salary_payments row for that month if one exists.
// A NULL payment_id means that employee hasn't been recorded as paid for
// this month yet - there's no separate "unpaid" row to create, absence
// of a row IS the unpaid state (see the schema.sql migration comment).
async function listForMonth(month) {
  const [rows] = await pool.query(
    `SELECT e.id AS employee_id, e.first_name, e.last_name, e.job_title,
            e.net_salary AS default_net_salary, e.gross_salary AS default_gross_salary,
            sp.id AS payment_id, sp.net_salary AS paid_net_salary, sp.gross_salary AS paid_gross_salary,
            sp.paid_date, sp.payslip_path, sp.payslip_original_name
       FROM employees e
       LEFT JOIN salary_payments sp ON sp.employee_id = e.id AND sp.month = ?
      WHERE e.active = 1
      ORDER BY e.last_name ASC, e.first_name ASC`,
    [month]
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT sp.*, CONCAT(e.first_name, ' ', e.last_name) AS employee_name, e.job_title
       FROM salary_payments sp
       JOIN employees e ON e.id = sp.employee_id
      WHERE sp.id = ?
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

// Payment history for one employee's detail page - same idea as
// invoiceModel.listBySupplier.
async function listForEmployee(employeeId) {
  const [rows] = await pool.query(
    'SELECT * FROM salary_payments WHERE employee_id = ? ORDER BY month DESC',
    [employeeId]
  );
  return rows;
}

async function create({
  employeeId, month, netSalary, grossSalary, paidDate, payslipPath, payslipOriginalName
}) {
  const [result] = await pool.query(
    `INSERT INTO salary_payments
       (employee_id, month, net_salary, gross_salary, paid_date, payslip_path, payslip_original_name)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [employeeId, month, netSalary, grossSalary, paidDate, payslipPath || null, payslipOriginalName || null]
  );
  return result.insertId;
}

async function updatePayslip(id, { payslipPath, payslipOriginalName }) {
  await pool.query(
    'UPDATE salary_payments SET payslip_path = ?, payslip_original_name = ? WHERE id = ?',
    [payslipPath, payslipOriginalName, id]
  );
}

async function remove(id) {
  await pool.query('DELETE FROM salary_payments WHERE id = ?', [id]);
}

module.exports = { listForMonth, findById, listForEmployee, create, updatePayslip, remove };
