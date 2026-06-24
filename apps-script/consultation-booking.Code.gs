/**
 * Consultation booking endpoint for workeron.agency "Request Consultation".
 *
 * Replaces the previous (source-lost) booking Apps Script. Implements the same
 * contract the site expects AND adds Max to every booked call as a guest.
 *
 *   GET  ?action=slots&date=YYYY-MM-DD
 *        -> { "date":"YYYY-MM-DD", "slots":[ {"start":"HH:mm","end":"HH:mm","iso":"...+07:00"}, ... ] }
 *        (empty slots + {message} for weekends / past dates / fully booked)
 *   POST { "action":"book", "name","email","message","date":"YYYY-MM-DD","startTime":"HH:mm" }
 *        -> { "success": true, "meetLink": "https://meet.google.com/..." }  (or {success:false,error})
 *
 * Creates a Google Calendar event WITH a Google Meet link and invites
 * the requester + ALWAYS_GUESTS (Max). Availability is checked against CALENDAR_ID.
 *
 * SETUP (one-time, in the Apps Script editor):
 *   1. Deploy under the Google account that should HOST the calls (its calendar is used).
 *   2. Editor → Services (+) → add "Google Calendar API" (advanced service, identifier `Calendar`).
 *   3. Project Settings → set the time zone to (GMT+07:00) to match TIMEZONE below.
 *   4. Run `doGet` once to authorize Calendar scopes.
 *   5. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 *   6. Put the /exec URL into the site admin → Forms & Settings → consultationFormUrl.
 */

// ---- CONFIG ----
var CALENDAR_ID   = 'primary';                       // host calendar; or a specific Google Calendar ID
var TIMEZONE      = 'Asia/Bangkok';                  // +07:00 (matches the previous script)
var WORK_START    = '11:30';                         // first slot start (local TIMEZONE)
var WORK_END      = '17:00';                         // last slot ends by this time
var SLOT_MINUTES  = 30;
var ALWAYS_GUESTS = ['max.gera@workeron.ai'];        // added to EVERY booked call
var EVENT_TITLE   = 'Workeron AI — Consultation';

// ---- helpers ----
function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function hmToMin_(hm) { var p = hm.split(':'); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); }
function minToHM_(m) { var h = Math.floor(m / 60), mm = m % 60; return ('0' + h).slice(-2) + ':' + ('0' + mm).slice(-2); }
function getCal_() { return CALENDAR_ID === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(CALENDAR_ID); }
function isoOf_(d) { return Utilities.formatDate(d, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX"); }

/**
 * Build a Date at the given wall-clock (y-m-d + minutes-from-midnight).
 * Relies on the Apps Script PROJECT time zone being set to TIMEZONE (see SETUP step 3),
 * so `new Date(y, mo-1, d, hh, mm)` is interpreted in +07:00.
 */
function dateAt_(year, month, day, minutes) {
  return new Date(year, month - 1, day, Math.floor(minutes / 60), minutes % 60, 0, 0);
}

function computeSlots_(dateStr) {
  var parts = dateStr.split('-');
  var y = parseInt(parts[0], 10), m = parseInt(parts[1], 10), d = parseInt(parts[2], 10);
  var dayStart = dateAt_(y, m, d, 0);
  var dow = parseInt(Utilities.formatDate(dayStart, TIMEZONE, 'u'), 10); // 6=Sat,7=Sun
  if (dow === 6 || dow === 7) return { date: dateStr, slots: [], message: 'Weekend' };

  var now = new Date();
  var endOfDay = dateAt_(y, m, d, 24 * 60);
  if (endOfDay <= now) return { date: dateStr, slots: [], message: 'Date is in the past' };

  // Busy intervals from the host calendar for the day.
  var busy = getCal_().getEvents(dateAt_(y, m, d, 0), dateAt_(y, m, d, 24 * 60)).map(function (ev) {
    return { s: ev.getStartTime().getTime(), e: ev.getEndTime().getTime() };
  });

  var slots = [];
  for (var t = hmToMin_(WORK_START); t + SLOT_MINUTES <= hmToMin_(WORK_END); t += SLOT_MINUTES) {
    var start = dateAt_(y, m, d, t), end = dateAt_(y, m, d, t + SLOT_MINUTES);
    if (start <= now) continue;
    var overlaps = busy.some(function (b) { return start.getTime() < b.e && end.getTime() > b.s; });
    if (overlaps) continue;
    slots.push({ start: minToHM_(t), end: minToHM_(t + SLOT_MINUTES), iso: isoOf_(start) });
  }
  return { date: dateStr, slots: slots };
}

function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'slots' && e.parameter.date) {
    try { return jsonOutput_(computeSlots_(e.parameter.date)); }
    catch (err) { return jsonOutput_({ date: e.parameter.date, slots: [], error: String(err) }); }
  }
  return jsonOutput_({ ok: true, service: 'consultation-booking' });
}

function doPost(e) {
  try {
    var data = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    if (data.action !== 'book') return jsonOutput_({ success: false, error: 'Unknown action. Send { action: "book", ... }' });

    var name = String(data.name || '').trim();
    var email = String(data.email || '').trim();
    var message = String(data.message || '').trim();
    var date = String(data.date || '').trim();       // YYYY-MM-DD
    var startTime = String(data.startTime || '').trim(); // HH:mm
    if (!name || !email || email.indexOf('@') === -1 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime)) {
      return jsonOutput_({ success: false, error: 'Missing or invalid fields.' });
    }

    // Re-validate the slot is real and still free.
    var avail = computeSlots_(date);
    var ok = (avail.slots || []).some(function (s) { return s.start === startTime; });
    if (!ok) return jsonOutput_({ success: false, error: 'That time is no longer available. Please pick another slot.' });

    var p = date.split('-'), y = +p[0], mo = +p[1], d = +p[2], t = hmToMin_(startTime);
    var start = dateAt_(y, mo, d, t), end = dateAt_(y, mo, d, t + SLOT_MINUTES);

    var attendees = [{ email: email }];
    ALWAYS_GUESTS.forEach(function (g) { if (g && g.toLowerCase() !== email.toLowerCase()) attendees.push({ email: g }); });

    var event = {
      summary: EVENT_TITLE + ' — ' + name,
      description: (message ? message + '\n\n' : '') + 'Booked via workeron.agency. Requester: ' + name + ' <' + email + '>',
      start: { dateTime: isoOf_(start), timeZone: TIMEZONE },
      end: { dateTime: isoOf_(end), timeZone: TIMEZONE },
      attendees: attendees,
      conferenceData: { createRequest: { requestId: Utilities.getUuid(), conferenceSolutionKey: { type: 'hangoutsMeet' } } }
    };
    var created = Calendar.Events.insert(event, CALENDAR_ID, { conferenceDataVersion: 1, sendUpdates: 'all' });

    return jsonOutput_({ success: true, meetLink: created.hangoutLink || '' });
  } catch (err) {
    return jsonOutput_({ success: false, error: String(err) });
  }
}
