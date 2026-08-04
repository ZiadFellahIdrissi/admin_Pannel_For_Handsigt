const fs = require('fs');
const path = require('path');
const companyInfoModel = require('../models/companyInfoModel');
const { COMPANY_LOGO_DIR, COMPANY_LOGO_PUBLIC_BASE_URL } = require('../config/uploadPaths');

// Just a static hub page linking into whatever settings categories
// exist - "Administrative Information" today, more added here later as
// this section grows (same convention as consultants-management's hub).
function showHub(req, res) {
  res.render('settings/hub');
}

// All fields are optional free text - this is company reference data
// filled in whenever it's ready, not validated like a required form.
function extractFields(body) {
  const trim = (value) => {
    const v = (value || '').trim();
    return v || null;
  };

  return {
    ice: trim(body.ice),
    rc: trim(body.rc),
    patente: trim(body.patente),
    taxIdentifier: trim(body.taxIdentifier),
    cnssNumber: trim(body.cnssNumber),
    legalForm: trim(body.legalForm),
    legalName: trim(body.legalName),
    address: trim(body.address),
    email: trim(body.email),
    website: trim(body.website),
    phone: trim(body.phone),
    bankName: trim(body.bankName),
    bankAgency: trim(body.bankAgency),
    bankRib: trim(body.bankRib),
    bankIban: trim(body.bankIban),
    bankSwift: trim(body.bankSwift)
  };
}

async function showAdministrativeInfo(req, res) {
  const companyInfo = await companyInfoModel.get();
  res.render('settings/administrative-information', { companyInfo });
}

async function handleUpdateAdministrativeInfo(req, res) {
  const fields = extractFields(req.body);
  await companyInfoModel.update(fields);

  if (req.file) {
    const current = await companyInfoModel.get();
    if (current && current.invoice_logo_path) {
      // invoice_logo_path is a full public URL (same convention as
      // career_offers.image_path) - the on-disk file is just its last
      // path segment, inside COMPANY_LOGO_DIR.
      fs.unlink(path.join(COMPANY_LOGO_DIR, current.invoice_logo_path.split('/').pop()), () => {});
    }
    await companyInfoModel.updateLogo(`${COMPANY_LOGO_PUBLIC_BASE_URL}/${req.file.filename}`);
  }

  req.flash('success', 'Administrative information updated.');
  res.redirect('/settings/administrative-information');
}

module.exports = { showHub, showAdministrativeInfo, handleUpdateAdministrativeInfo };
