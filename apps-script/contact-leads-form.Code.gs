/**
 * Contact form (Request Consultation) — lead collector.
 *
 * Appends every contact lead to the "Workeron Agency leads form" Google Sheet
 * (tab gid 0): columns № | Date | Full Name | Work Email | Brief description.
 * The site posts each Step-1 submission here (independent of the booking flow),
 * so ALL leads are captured even if the consultation booking isn't completed.
 *
 * Deploy: Apps Script editor → Deploy → New deployment → type "Web app" →
 *   Execute as: Me   |   Who has access: Anyone
 * Then put the /exec URL into the site admin → Forms & Settings → contactLeadsFormUrl
 * (also used as the hardcoded fallback in index.html).
 *
 * The form posts JSON as text/plain (no CORS preflight); doPost reads
 * e.postData.contents and returns JSON {success:true|false}.
 */
var SHEET_ID = '136C-X2nf6EiDIInZtMoPbgMZaJ3vUVj4DO_FRKDulPs';
var TAB_GID = 0;
var HEADERS = ['№', 'Date', 'Full Name', 'Work Email', 'Brief description'];

function getTargetSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === TAB_GID) return sheets[i];
  }
  return ss.getActiveSheet(); // fallback
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
    if (data.website) {
      return jsonOutput_({ success: true });
    }

    var name = String(data.name || '').trim();
    var email = String(data.email || '').trim();
    var message = String(data.message || '').trim();

    if (!name || !email || email.indexOf('@') === -1) {
      return jsonOutput_({ success: false, error: 'Name and a valid email are required.' });
    }

    var sheet = getTargetSheet_();
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
    }

    // № = running sequence (header is row 1 → first lead gets 1, then 2, 3 …)
    var num = sheet.getLastRow();
    var ts = data.timestamp ? new Date(data.timestamp) : new Date();
    // Columns: № | Date | Full Name | Work Email | Brief description
    sheet.appendRow([num, ts, name, email, message]);

    return jsonOutput_({ success: true });
  } catch (err) {
    return jsonOutput_({ success: false, error: String(err) });
  }
}

function doGet() {
  return jsonOutput_({ ok: true, service: 'contact-leads' });
}
