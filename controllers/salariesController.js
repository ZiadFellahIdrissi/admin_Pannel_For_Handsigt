const fs = require('fs');
const path = require('path');
const employeeModel = require('../models/employeeModel');
const salaryPaymentModel = require('../models/salaryPaymentModel');
const { currentMonthKey, shiftMonth, monthLabel } = require('../utils/format');
const { PAYSLIP_DIR } = require('../config/uploadPaths');

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// Same prev/current/next month-navigator shape as
// invoicesController.js's monthFilterLocals - duplicated rather than
// shared since it's five lines and the two controllers have no other
// reason to depend on each other. Unlike invoices, "All Periods" doesn't
// make sense here (payroll is inherently a per-month checklist), so
// month always resolves to a concrete value instead of allowing null.
function monthFilterLocals(req) {
  const monthParam = (req.query.month || '').trim();
  const month = MONTH_RE.test(monthParam) ? monthParam : currentMonthKey();
  return { month, prevMonth: shiftMonth(month, -1), nextMonth: shiftMonth(month, 1) };
}

async function list(req, res) {
  const { month, prevMonth, nextMonth } = monthFilterLocals(req);
  const rows = await salaryPaymentModel.listForMonth(month);
  res.render('salaries/list', { rows, month, prevMonth, nextMonth });
}

// Records one employee's salary payment for one month - net/gross salary
// are freeform (default to the employee's current figures in the form,
// but editable, since a real month can differ - bonus, deduction,
// partial month). The payslip PDF is optional here (see
// handleUploadPayslip for adding/replacing it afterwards); paidDate
// defaults to today when left blank. The month+employee UNIQUE
// constraint is the safety net against double-recording, same pattern
// as invoices.invoice_number.
async function handleRecordPayment(req, res) {
  const employeeId = Number(req.body.employeeId);
  const month = (req.body.month || '').trim();
  const netSalary = Number(req.body.netSalary);
  const grossSalary = Number(req.body.grossSalary);
  const paidDate = (req.body.paidDate || '').trim() || new Date().toISOString().slice(0, 10);

  const cleanupUpload = () => {
    if (req.file) fs.unlink(path.join(PAYSLIP_DIR, req.file.filename), () => {});
  };

  if (!Number.isInteger(employeeId) || employeeId <= 0 || !MONTH_RE.test(month)) {
    cleanupUpload();
    return res.status(400).render('error', { message: 'Invalid employee or month.' });
  }

  const employee = await employeeModel.findById(employeeId);
  if (!employee) {
    cleanupUpload();
    return res.status(404).render('error', { message: 'Employee not found.' });
  }

  if (!Number.isFinite(netSalary) || netSalary < 0 || !Number.isFinite(grossSalary) || grossSalary < 0) {
    cleanupUpload();
    req.flash('error', 'Net and gross salary must be non-negative numbers.');
    return res.redirect(`/salaries?month=${month}`);
  }

  try {
    await salaryPaymentModel.create({
      employeeId, month, netSalary, grossSalary, paidDate,
      payslipPath: req.file ? req.file.filename : null,
      payslipOriginalName: req.file ? req.file.originalname : null
    });
  } catch (err) {
    cleanupUpload();
    if (err.code === 'ER_DUP_ENTRY') {
      req.flash('error', `${employee.first_name} ${employee.last_name} is already recorded as paid for ${monthLabel(month)}.`);
      return res.redirect(`/salaries?month=${month}`);
    }
    throw err;
  }

  req.flash('success', `Payment recorded for ${employee.first_name} ${employee.last_name} - ${monthLabel(month)}.`);
  res.redirect(`/salaries?month=${month}`);
}

async function showPaymentDetail(req, res) {
  const payment = await salaryPaymentModel.findById(req.params.id);
  if (!payment) {
    return res.status(404).render('error', { message: 'Payment record not found.' });
  }
  res.render('salaries/detail', { payment });
}

// Adds or replaces the payslip PDF on an already-recorded payment -
// same "swap the file, delete the old one" shape as
// invoicesController.handleUploadReal, minus the invoice-number/supplier
// bookkeeping that doesn't apply here.
async function handleUploadPayslip(req, res) {
  const payment = await salaryPaymentModel.findById(req.params.id);
  if (!payment) {
    return res.status(404).render('error', { message: 'Payment record not found.' });
  }

  if (!req.file) {
    req.flash('error', 'Choose a PDF file to upload.');
    return res.redirect(`/salaries/payment/${payment.id}`);
  }

  await salaryPaymentModel.updatePayslip(payment.id, {
    payslipPath: req.file.filename,
    payslipOriginalName: req.file.originalname
  });

  if (payment.payslip_path) {
    fs.unlink(path.join(PAYSLIP_DIR, payment.payslip_path), () => {});
  }

  req.flash('success', 'Payslip uploaded.');
  res.redirect(`/salaries/payment/${payment.id}`);
}

async function handleDeletePayment(req, res) {
  const payment = await salaryPaymentModel.findById(req.params.id);
  if (!payment) {
    return res.status(404).render('error', { message: 'Payment record not found.' });
  }

  if (payment.payslip_path) {
    fs.unlink(path.join(PAYSLIP_DIR, payment.payslip_path), () => {});
  }

  await salaryPaymentModel.remove(payment.id);
  req.flash('success', 'Payment record deleted.');
  res.redirect(`/salaries?month=${payment.month}`);
}

// Private/authenticated only - payslips are financial documents about a
// real person, same reasoning as invoicesController.servePdf.
async function servePayslip(req, res) {
  const payment = await salaryPaymentModel.findById(req.params.id);
  if (!payment || !payment.payslip_path) {
    return res.status(404).render('error', { message: 'No payslip on file for this payment.' });
  }

  const filePath = path.join(PAYSLIP_DIR, payment.payslip_path);
  if (!fs.existsSync(filePath)) {
    return res.status(404).render('error', { message: 'Payslip file is missing on disk.' });
  }

  if (req.query.download === '1') {
    res.setHeader('Content-Disposition', `attachment; filename="${payment.payslip_original_name || 'payslip.pdf'}"`);
  }
  res.type('application/pdf');
  res.sendFile(filePath);
}

module.exports = {
  list,
  handleRecordPayment,
  showPaymentDetail,
  handleUploadPayslip,
  handleDeletePayment,
  servePayslip
};
