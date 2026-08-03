const ExcelJS = require('exceljs');
const candidateModel = require('../models/candidateModel');

const XLSX_MIMETYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Column order is load-bearing: handleImport reads rows back by this same
// index order (see the header-validation check below), not by re-parsing
// header text into a lookup - reordering these breaks nothing here, but
// changing them means an already-downloaded template in the wild would
// fail the header check on upload. ID is first and is the update-match
// key - blank means "create a new candidate", filled means "update this
// one" (see handleImport).
const EXPORT_COLUMNS = [
  { header: 'ID', key: 'id' },
  { header: 'First Name', key: 'firstName' },
  { header: 'Last Name', key: 'lastName' },
  { header: 'Email', key: 'email' },
  { header: 'Phone', key: 'phone' },
  { header: 'WhatsApp', key: 'whatsapp' },
  { header: 'City', key: 'city' },
  { header: 'Country', key: 'country' },
  { header: 'First Experience Date', key: 'firstExperienceDate' },
  { header: 'Graduation Date', key: 'graduationDate' },
  { header: 'Possible Roles', key: 'possibleRoles' },
  { header: 'Education', key: 'education' },
  { header: 'Skills', key: 'skills' },
  { header: 'Languages', key: 'languages' },
  { header: 'LinkedIn URL', key: 'linkedinUrl' },
  { header: 'Portfolio URL', key: 'portfolioUrl' },
  { header: 'Expected Salary', key: 'expectedSalary' },
  { header: 'Expected TJM', key: 'expectedTjm' },
  { header: 'Availability', key: 'availability' },
  { header: 'Source', key: 'source' },
  { header: 'Open to CDD', key: 'openToCdd' },
  { header: 'Open to CDI', key: 'openToCdi' },
  { header: 'Open to Freelance', key: 'openToFreelance' },
  { header: 'Status', key: 'status' },
  { header: 'Rating', key: 'rating' },
  { header: 'Notes', key: 'notes' }
];

function buildWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Candidates');
  worksheet.columns = EXPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 18 }));
  worksheet.getRow(1).font = { bold: true };
  return { workbook, worksheet };
}

async function sendWorkbook(res, workbook, filename) {
  res.setHeader('Content-Type', XLSX_MIMETYPE);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

// Snake_case DB row -> the workbook's camelCase column keys. Dates are
// kept as the plain 'YYYY-MM-DD' strings already returned by mysql2
// (dateStrings: true) rather than converted to a JS Date - avoids Excel
// serial-date/timezone round-trip issues entirely. Booleans are written
// as 'Yes'/'No' - more natural to edit by hand in a spreadsheet than 1/0.
function candidateToRow(c) {
  return {
    id: c.id,
    firstName: c.first_name,
    lastName: c.last_name,
    email: c.email,
    phone: c.phone,
    whatsapp: c.whatsapp,
    city: c.city,
    country: c.country,
    firstExperienceDate: c.first_experience_date,
    graduationDate: c.graduation_date,
    possibleRoles: c.possible_roles,
    education: c.education,
    skills: c.skills,
    languages: c.languages,
    linkedinUrl: c.linkedin_url,
    portfolioUrl: c.portfolio_url,
    expectedSalary: c.expected_salary !== null ? Number(c.expected_salary) : null,
    expectedTjm: c.expected_tjm !== null ? Number(c.expected_tjm) : null,
    availability: c.availability,
    source: c.source,
    openToCdd: c.open_to_cdd ? 'Yes' : 'No',
    openToCdi: c.open_to_cdi ? 'Yes' : 'No',
    openToFreelance: c.open_to_freelance ? 'Yes' : 'No',
    status: c.status,
    rating: c.rating,
    notes: c.notes
  };
}

async function showImportExportPage(req, res) {
  const status = req.query.status || '';
  const q = req.query.q || '';
  const minExperience = req.query.minExperience || '';
  const position = req.query.position || '';
  const city = req.query.city || '';
  const candidates = await candidateModel.list({ status, q, minExperience, position, city });
  res.render('candidates/import-export', {
    candidates,
    status,
    q,
    minExperience,
    position,
    city,
    statuses: candidateModel.STATUSES,
    statusLabels: candidateModel.STATUS_LABELS
  });
}

async function downloadTemplate(req, res) {
  const { workbook } = buildWorkbook();
  await sendWorkbook(res, workbook, 'candidates-add-template.xlsx');
}

async function downloadSelected(req, res) {
  const rawIds = req.body.candidateIds;
  const ids = (Array.isArray(rawIds) ? rawIds : rawIds ? [rawIds] : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);

  if (ids.length === 0) {
    req.flash('error', 'Choose at least one candidate to export.');
    return res.redirect('/candidates/import-export');
  }

  const candidates = await candidateModel.findByIds(ids);
  const { workbook, worksheet } = buildWorkbook();
  candidates.forEach((c) => worksheet.addRow(candidateToRow(c)));
  await sendWorkbook(res, workbook, 'candidates-update-template.xlsx');
}

async function handleImport(req, res) {
  if (!req.file) {
    req.flash('error', 'Choose an .xlsx file to upload.');
    return res.redirect('/candidates/import-export');
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(req.file.buffer);
  } catch {
    req.flash('error', 'Could not read that file - make sure it is a valid .xlsx file.');
    return res.redirect('/candidates/import-export');
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    req.flash('error', 'That file has no worksheet to read.');
    return res.redirect('/candidates/import-export');
  }

  // Column order is load-bearing (see EXPORT_COLUMNS comment) - reject
  // early with a clear message rather than silently misassigning data
  // into the wrong fields.
  const headerRow = worksheet.getRow(1);
  const headersMatch = EXPORT_COLUMNS.every((col, i) => (headerRow.getCell(i + 1).text || '').trim() === col.header);
  if (!headersMatch) {
    req.flash('error', "Column headers don't match the expected template - please use a downloaded template without reordering or renaming columns.");
    return res.redirect('/candidates/import-export');
  }

  function cellText(row, key) {
    const idx = EXPORT_COLUMNS.findIndex((c) => c.key === key) + 1;
    const value = row.getCell(idx).value;
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'object' && value.text) return String(value.text).trim();
    return String(value).trim();
  }

  const numberOrNull = (v) => (v === '' ? null : Number(v));
  const parseBool = (v) => ['yes', 'y', '1', 'true', 'x'].includes(v.toLowerCase());

  let created = 0;
  let updated = 0;
  const errors = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    if (!row.hasValues) continue;

    const idRaw = cellText(row, 'id');
    const firstName = cellText(row, 'firstName');
    const lastName = cellText(row, 'lastName');

    if (!firstName || !lastName) {
      errors.push(`Row ${rowNumber}: first and last name are required.`);
      continue;
    }

    const statusRaw = cellText(row, 'status');
    const fields = {
      firstName,
      lastName,
      email: cellText(row, 'email') || null,
      phone: cellText(row, 'phone') || null,
      whatsapp: cellText(row, 'whatsapp') || null,
      city: cellText(row, 'city') || null,
      country: cellText(row, 'country') || null,
      firstExperienceDate: cellText(row, 'firstExperienceDate') || null,
      graduationDate: cellText(row, 'graduationDate') || null,
      possibleRoles: cellText(row, 'possibleRoles') || null,
      education: cellText(row, 'education') || null,
      skills: cellText(row, 'skills') || null,
      languages: cellText(row, 'languages') || null,
      linkedinUrl: cellText(row, 'linkedinUrl') || null,
      portfolioUrl: cellText(row, 'portfolioUrl') || null,
      expectedSalary: numberOrNull(cellText(row, 'expectedSalary')),
      expectedTjm: numberOrNull(cellText(row, 'expectedTjm')),
      availability: cellText(row, 'availability') || null,
      source: cellText(row, 'source') || null,
      openToCdd: parseBool(cellText(row, 'openToCdd')),
      openToCdi: parseBool(cellText(row, 'openToCdi')),
      openToFreelance: parseBool(cellText(row, 'openToFreelance')),
      status: candidateModel.STATUSES.includes(statusRaw) ? statusRaw : 'new',
      rating: numberOrNull(cellText(row, 'rating')),
      notes: cellText(row, 'notes') || null
    };

    try {
      if (idRaw) {
        const existing = await candidateModel.findById(Number(idRaw));
        if (!existing) {
          errors.push(`Row ${rowNumber}: no candidate with ID ${idRaw} - leave ID blank to add as new instead.`);
          continue;
        }
        await candidateModel.update(existing.id, fields);
        updated += 1;
      } else {
        await candidateModel.create(fields);
        created += 1;
      }
    } catch (err) {
      errors.push(`Row ${rowNumber}: ${err.message}`);
    }
  }

  req.flash('success', `Import finished: ${created} created, ${updated} updated${errors.length ? `, ${errors.length} skipped` : ''}.`);
  errors.slice(0, 10).forEach((e) => req.flash('error', e));
  if (errors.length > 10) req.flash('error', `...and ${errors.length - 10} more row error(s).`);

  res.redirect('/candidates/import-export');
}

module.exports = { showImportExportPage, downloadTemplate, downloadSelected, handleImport };
