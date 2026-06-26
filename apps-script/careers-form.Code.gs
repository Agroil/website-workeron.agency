/**
 * Careers / "Current Opportunities" application form endpoint.
 *
 * Appends each submission to the results Google Sheet, tab gid 115747773.
 * First deploy: Apps Script editor → Deploy → New deployment → "Web app" → Execute as: Me | Who has access: Anyone.
 * To UPDATE (keep the same /exec URL): Manage deployments → Edit (pencil) → Version: New version → Deploy.
 *   ⚠ Never use "New deployment" for updates — it mints a NEW /exec URL and the live form breaks.
 * Copy the /exec URL into the site admin → Forms & Settings → applyFormUrl
 * (and it is also used as the hardcoded fallback in index.html).
 *
 * The form posts JSON as text/plain (no CORS preflight); doPost reads
 * e.postData.contents and returns JSON {success:true|false}.
 */
var SHEET_ID = '1jEXRFs4YSRzPmhUulrCq2ST9_7Qw_thwr8FRhzf1Z3Y';
var TAB_GID = 115747773;          // "Applications" tab
var TAB_NAME = 'Applications';    // fallback if the gid ever changes
// SHARED SHEET: 1jEXRFs4… "Applications" is ALSO written by workhold.ai (apply-consult.gs).
// The column layout is a CONTRACT — change columns ONLY in sync on BOTH scripts + the sheet header row.
var HEADERS = ['Timestamp', 'Name', 'Email', 'Role', 'LinkedIn / Portfolio', 'Status', 'Source'];
var DEFAULT_STATUS = 'New';
var SOURCE = 'workeron.agency'; // Source column = which site the application came from (vs 'workhold.ai')

// ticket 86ey2e9xu req 3 — email alert recipients for the workeron.agency application (careers) form.
var NOTIFY_CC = ['v.myshchenko@workeron.ai', 'kateryna.hryhoriuk@workeron.ai', 'anastasiia.k@workeron.ai'];
// Guards GET ?action=selftest (and the &send=1 live test). An editor Run of selfTest_ needs no key.
var SELFTEST_KEY = 'wh-selftest-2026';

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
    // Columns: Timestamp | Name | Email | Role | LinkedIn / Portfolio | Status | Source
    sheet.appendRow([ts, name, email, role, linkedin, DEFAULT_STATUS, SOURCE]);

    notifyCc_(name, email, role, linkedin); // ticket 86ey2e9xu req 3 — alert after the row is saved
    return jsonOutput_({ success: true });
  } catch (err) {
    return jsonOutput_({ success: false, error: String(err) });
  }
}

function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'selftest' && e.parameter.key === SELFTEST_KEY) {
    return jsonOutput_(selfTest_({ send: e.parameter.send === '1' })); // &send=1 → one live [TEST] email (ticket 86ey2e9xu)
  }
  return jsonOutput_({ ok: true, service: 'careers-apply' });
}

// ticket 86ey2e9xu req 3 — email alert on each agency application. Fire-and-forget: a send failure must
// NEVER break the submission, so it is wrapped and logged, never thrown.
function notifyCc_(name, email, role, linkedin) {
  try {
    var clean = function (s) { return String(s || '').replace(/[\r\n]+/g, ' '); }; // no header/newline injection
    var subject = 'New application (workeron.agency): ' + clean(name) + (role ? ' — ' + clean(role) : '');
    var body =
      'New application via workeron.agency\n\n' +
      'Name: ' + (name || '—') + '\n' +
      'Email: ' + (email || '—') + '\n' +
      'Role: ' + (role || '—') + '\n' +
      'LinkedIn / Portfolio: ' + (linkedin || '—') + '\n';
    GmailApp.sendEmail(NOTIFY_CC.join(','), subject, body, { replyTo: email });
  } catch (err) {
    console.error('agency careers notify failed: ' + err); // visible in Executions; the submission already succeeded
  }
}

// Non-destructive auth probe (ticket 86ey2e9xu). The Apply form is fire-and-forget, so a missing Gmail
// scope would otherwise fail INVISIBLY. Run selfTest_ from the editor to trigger the project's OAuth
// consent (Sheets EDIT + Gmail-send, since notifyCc_ uses GmailApp), which authorizes the live /exec with
// no redeploy. After deploy: GET ?action=selftest&key=<SELFTEST_KEY> (&send=1 = one live [TEST] email).
function selfTest_(opts) {
  var r = { service: 'careers-apply', ok: true };

  // Sheets EDIT — write+clear ONE cell on a dedicated hidden tab (never inserts/removes a data row).
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var p = ss.getSheetByName('__selftest__');
    if (!p) { p = ss.insertSheet('__selftest__'); p.hideSheet(); }
    p.getRange('A1').setValue('selftest ' + new Date());
    SpreadsheetApp.flush();
    p.getRange('A1').clearContent();
    r.sheetWrite = 'PASS (' + ss.getName() + ')';
  } catch (err) { r.sheetWrite = 'FAIL: ' + err; r.ok = false; }

  // Gmail SEND-scope proof WITHOUT sending: a real GmailApp call forces the Gmail scope (quota does not).
  try { GmailApp.getAliases(); r.gmailScope = 'PASS'; }
  catch (err) { r.gmailScope = 'FAIL (consent not granted?): ' + err; r.ok = false; }
  try { r.mailQuota = MailApp.getRemainingDailyQuota() + ' left'; } catch (e) {}

  // Definitive send proof — ONLY on &send=1: one '[TEST]' to the real recipients.
  if (opts && opts.send) {
    try {
      GmailApp.sendEmail(NOTIFY_CC.join(','), '[TEST] form-alert — careers-apply (workeron.agency)',
        'Selftest at ' + new Date() + '. If you received this, the agency Apply alert works. Safe to ignore.');
      r.testSend = 'SENT to ' + NOTIFY_CC.join(', ');
    } catch (err) { r.testSend = 'FAIL: ' + err; r.ok = false; }
  }

  r.recipients = NOTIFY_CC.join(', ');
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}
