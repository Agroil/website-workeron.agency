/**
 * Careers / "Current Opportunities" application form endpoint.
 *
 * Appends each submission to the results Google Sheet, tab gid 115747773.
 * Deploy: Apps Script editor → Deploy → New deployment → type "Web app" →
 *   Execute as: Me   |   Who has access: Anyone
 * Copy the /exec URL into the site admin → Forms & Settings → applyFormUrl
 * (and it is also used as the hardcoded fallback in index.html).
 *
 * The form posts JSON as text/plain (no CORS preflight); doPost reads
 * e.postData.contents and returns JSON {success:true|false}.
 */
var SHEET_ID = '1jEXRFs4YSRzPmhUulrCq2ST9_7Qw_thwr8FRhzf1Z3Y';
var TAB_GID = 115747773;          // "Applications" tab
var TAB_NAME = 'Applications';    // fallback if the gid ever changes
var HEADERS = ['Timestamp', 'Name', 'Email', 'Role', 'LinkedIn / Portfolio', 'Status'];
var DEFAULT_STATUS = 'New';

function getTargetSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === TAB_GID) return sheets[i];
  }
  return ss.getSheetByName(TAB_NAME) || ss.getActiveSheet(); // fallbacks
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var data = {};
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    }

    // Honeypot: silently accept (no row) if a bot filled the hidden field.
    if (data.company_website) {
      return jsonOutput_({ success: true });
    }

    var name = String(data.name || '').trim();
    var email = String(data.email || '').trim();
    var role = String(data.role || '').trim();
    var linkedin = String(data.linkedin || '').trim();

    if (!name || !email || email.indexOf('@') === -1) {
      return jsonOutput_({ success: false, error: 'Name and a valid email are required.' });
    }

    var sheet = getTargetSheet_();
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
    }

    var ts = data.timestamp ? new Date(data.timestamp) : new Date();
    // Columns: Timestamp | Name | Email | Role | LinkedIn / Portfolio | Status
    sheet.appendRow([ts, name, email, role, linkedin, DEFAULT_STATUS]);

    return jsonOutput_({ success: true });
  } catch (err) {
    return jsonOutput_({ success: false, error: String(err) });
  }
}

function doGet() {
  return jsonOutput_({ ok: true, service: 'careers-apply' });
}
