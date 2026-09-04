const employeeModel = require('../models/employeeModel');
const salaryPaymentModel = require('../models/salaryPaymentModel');

function parseActiveFilter(value) {
  if (value === '1') return 1;
  if (value === '0') return 0;
  return undefined;
}

// email/phone/jobTitle/bank fields are all optional free text - trimmed
// to null-if-empty, same convention as clientsController/suppliersController.
// netSalary/grossSalary are the two non-string fields, validated by the
// caller (handleCreate/handleUpdate) same as clientsController's
// registeredCapital.
function extractFields(body) {
  const trim = (value) => {
    const v = (value || '').trim();
    return v || null;
  };

  return {
    email: trim(body.email),
    phone: trim(body.phone),
    jobTitle: trim(body.jobTitle),
    netSalary: body.netSalary ? Number(body.netSalary) : null,
    grossSalary: body.grossSalary ? Number(body.grossSalary) : null,
    bankName: trim(body.bankName),
    bankRib: trim(body.bankRib),
    bankIban: trim(body.bankIban),
    bankSwift: trim(body.bankSwift)
  };
}

function validateSalaries(fields, errors) {
  if (fields.netSalary !== null && (!Number.isFinite(fields.netSalary) || fields.netSalary < 0)) {
    errors.push('Net salary must be a non-negative number.');
  }
  if (fields.grossSalary !== null && (!Number.isFinite(fields.grossSalary) || fields.grossSalary < 0)) {
    errors.push('Gross salary must be a non-negative number.');
  }
}

async function list(req, res) {
  const activeFilter = parseActiveFilter(req.query.active);
  const employees = await employeeModel.list(activeFilter);
  res.render('employees/list', { employees, activeFilter: req.query.active || 'all' });
}

function showCreateForm(req, res) {
  res.render('employees/form', { mode: 'create', employeeRow: null, errors: [] });
}

async function handleCreate(req, res) {
  const firstName = (req.body.firstName || '').trim();
  const lastName = (req.body.lastName || '').trim();
  const fields = extractFields(req.body);

  const errors = [];
  if (!firstName) errors.push('First name is required.');
  if (!lastName) errors.push('Last name is required.');
  validateSalaries(fields, errors);

  if (errors.length) {
    return res.status(400).render('employees/form', { mode: 'create', employeeRow: { firstName, lastName, ...fields }, errors });
  }

  const id = await employeeModel.create({ firstName, lastName, ...fields });
  req.flash('success', `Employee "${firstName} ${lastName}" created.`);
  res.redirect('/employees');
}

async function showDetail(req, res) {
  const employee = await employeeModel.findById(req.params.id);
  if (!employee) {
    return res.status(404).render('error', { message: 'Employee not found.' });
  }
  const payments = await salaryPaymentModel.listForEmployee(employee.id);
  res.render('employees/detail', { employeeRow: employee, payments });
}

async function showEditForm(req, res) {
  const employee = await employeeModel.findById(req.params.id);
  if (!employee) {
    return res.status(404).render('error', { message: 'Employee not found.' });
  }
  res.render('employees/form', { mode: 'edit', employeeRow: employee, errors: [] });
}

async function handleUpdate(req, res) {
  const employee = await employeeModel.findById(req.params.id);
  if (!employee) {
    return res.status(404).render('error', { message: 'Employee not found.' });
  }

  const firstName = (req.body.firstName || '').trim();
  const lastName = (req.body.lastName || '').trim();
  const fields = extractFields(req.body);

  const errors = [];
  if (!firstName) errors.push('First name is required.');
  if (!lastName) errors.push('Last name is required.');
  validateSalaries(fields, errors);

  if (errors.length) {
    return res.status(400).render('employees/form', {
      mode: 'edit',
      employeeRow: { ...employee, firstName, lastName, ...fields },
      errors
    });
  }

  await employeeModel.update(employee.id, { firstName, lastName, ...fields });
  req.flash('success', 'Employee updated.');
  res.redirect('/employees');
}

async function handleToggleActive(req, res) {
  const employee = await employeeModel.findById(req.params.id);
  if (!employee) {
    return res.status(404).render('error', { message: 'Employee not found.' });
  }
  await employeeModel.setActive(employee.id, !employee.active);
  req.flash('success', employee.active ? 'Employee deactivated.' : 'Employee activated.');
  res.redirect('/employees');
}

async function handleDelete(req, res) {
  const employee = await employeeModel.findById(req.params.id);
  if (!employee) {
    return res.status(404).render('error', { message: 'Employee not found.' });
  }

  const hasPayments = await employeeModel.hasAnyPayments(employee.id);
  if (hasPayments) {
    req.flash('error', `"${employee.first_name} ${employee.last_name}" can't be deleted - they have salary payment history. Deactivate them instead.`);
    return res.redirect('/employees');
  }

  await employeeModel.remove(employee.id);
  req.flash('success', `Employee "${employee.first_name} ${employee.last_name}" deleted.`);
  res.redirect('/employees');
}

module.exports = { list, showCreateForm, handleCreate, showDetail, showEditForm, handleUpdate, handleToggleActive, handleDelete };
