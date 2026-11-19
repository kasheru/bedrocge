/**
 * BEDROC enquiries -> Google Sheet row + email.
 * Paste into Extensions > Apps Script of the Google Sheet that should hold the enquiries.
 * Then: Deploy > New deployment > Web app > Execute as "Me", Who has access "Anyone".
 */
const NOTIFY_EMAIL = 'info@bedrocge.com';     // where the email alert goes (comma-separate for several)
const SECRET = 'CHANGE-ME-TO-A-LONG-RANDOM-STRING'; // must equal ENQUIRY_SECRET in the website's .env
const SHEET = 'Enquiries';

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.secret !== SECRET) return out({ ok: false, error: 'bad secret' });

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const sh = sheet_();
      const ids = sh.getRange(2, 7, Math.max(sh.getLastRow() - 1, 1), 1).getValues().flat();
      if (ids.indexOf(d.id) !== -1) return out({ ok: true, duplicate: true }); // retried request

      const n = sh.getLastRow(); // header counts as 1 row, so this is the new enquiry's number
      sh.appendRow([n, new Date(d.at), d.name, d.organisation, d.email, d.message, d.id]);
      SpreadsheetApp.flush();

      MailApp.sendEmail({
        to: NOTIFY_EMAIL,
        replyTo: d.email,
        subject: 'New BEDROC enquiry #' + n + ' from ' + d.name,
        body: 'Enquiry #' + n + '\n\nName: ' + d.name + '\nOrganisation: ' + (d.organisation || '-') +
              '\nEmail: ' + d.email + '\n\nProject details:\n' + d.message +
              '\n\nTotal enquiries so far: ' + n + '\nSheet: ' + SpreadsheetApp.getActive().getUrl()
      });
      return out({ ok: true, number: n });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function sheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET);
    sh.appendRow(['#', 'Received', 'Name', 'Organisation', 'Email', 'Project details', 'ID']);
    sh.getRange('A1:G1').setFontWeight('bold').setBackground('#0A2347').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.getRange('B:B').setNumberFormat('dd mmm yyyy, hh:mm');
    sh.setColumnWidth(6, 420);
    sh.getRange('F:F').setWrap(true);
  }
  return sh;
}

/** Run once from the editor (Run > setup) to create the sheets, the counters and grant permissions. */
function setup() {
  sheet_();
  const ss = SpreadsheetApp.getActive();
  let s = ss.getSheetByName('Summary') || ss.insertSheet('Summary', 0);
  s.clear();
  s.getRange('A1:B1').setValues([['BEDROC enquiries', '']]).setFontWeight('bold').setFontSize(14);
  s.getRange('A3:B6').setFormulas([
    ['Total enquiries', "=COUNTA(Enquiries!A2:A)"],
    ['This month', "=COUNTIFS(Enquiries!B2:B,\">=\"&EOMONTH(TODAY(),-1)+1)"],
    ['Last 7 days', "=COUNTIFS(Enquiries!B2:B,\">=\"&TODAY()-7)"],
    ['Latest enquiry', "=IFERROR(TEXT(MAX(Enquiries!B2:B),\"dd mmm yyyy, hh:mm\"),\"-\")"]
  ]);
  s.getRange('A3:A6').setFontWeight('bold');
  s.getRange('B3:B5').setFontSize(16);
  s.setColumnWidth(1, 180); s.setColumnWidth(2, 180);
  MailApp.getRemainingDailyQuota(); // triggers the email permission prompt
}
