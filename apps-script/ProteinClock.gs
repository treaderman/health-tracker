/**
 * Protein clock — Google Calendar alerts
 *
 * When you log food with enough protein, this puts a single event on a
 * calendar named "Protein Clock" at (last protein time + 5h - 30min),
 * with a popup reminder that fires at the event start.
 *
 * There is never more than one of these events. Logging protein again
 * moves it. If the alert would land inside quiet hours, it is skipped.
 */

var PROTEIN_EVENT_PREFIX = 'Protein window';
var PROTEIN_CALENDAR_NAME = 'Protein Clock';
var PROTEIN_TEST_TITLE = 'Protein Clock test';

function rescheduleProteinClock_() {
  var settings = readSettings_();
  var cal = getProteinCalendar_(settings);
  if (!cal) return { scheduled: false, reason: 'no_calendar' };

  clearFutureProteinEvents_(cal);

  var info = lastProteinInfo_(settings);
  if (!info.timestamp) return { scheduled: false, reason: 'no_protein_logged_yet' };

  var lastMs = Date.parse(info.timestamp);
  if (isNaN(lastMs)) return { scheduled: false, reason: 'bad_timestamp' };

  var windowHours = num_(settings.protein_window_hours, 5);
  var leadMin = num_(settings.protein_alert_lead_min, 30);
  var alertAt = new Date(lastMs + (windowHours * 3600000) - (leadMin * 60000));

  if (alertAt.getTime() <= Date.now()) {
    return { scheduled: false, reason: 'window_already_passed', wouldHaveBeen: alertAt.toISOString() };
  }
  if (inQuietHours_(alertAt, settings)) {
    return { scheduled: false, reason: 'quiet_hours', wouldHaveBeen: alertAt.toISOString() };
  }

  var title = PROTEIN_EVENT_PREFIX + ' — ' + Math.round(leadMin) + ' min left';
  var event = cal.createEvent(title, alertAt, new Date(alertAt.getTime() + 5 * 60000));
  event.removeAllReminders();
  event.addPopupReminder(0);

  return {
    scheduled: true,
    title: title,
    at: alertAt.toISOString(),
    atLocal: Utilities.formatDate(alertAt, tz_(), 'yyyy-MM-dd h:mm a'),
    lastProtein: info.timestamp
  };
}

function resetProteinClock_() {
  writeSetting_('last_protein_reset', nowIso_());
  var clock = rescheduleProteinClock_();
  return { ok: true, resetAt: nowIso_(), proteinClock: clock };
}

/**
 * When the next nudge is due, without creating anything.
 *
 * The phone shows this, so it has to agree with what the calendar will
 * actually do — including staying quiet overnight.
 */
function nextProteinAlert_(settings) {
  settings = settings || readSettings_();
  var info = lastProteinInfo_(settings);
  if (!info.timestamp) return null;

  var lastMs = Date.parse(info.timestamp);
  if (isNaN(lastMs)) return null;

  var at = new Date(lastMs
    + (num_(settings.protein_window_hours, 5) * 3600000)
    - (num_(settings.protein_alert_lead_min, 30) * 60000));

  var status = 'scheduled';
  if (at.getTime() <= Date.now()) status = 'passed';
  else if (inQuietHours_(at, settings)) status = 'quiet_hours';

  return {
    at: at.toISOString(),
    atLocal: Utilities.formatDate(at, tz_(), 'h:mm a'),
    status: status
  };
}

/**
 * Puts a one-off test alert on the Protein Clock calendar a couple of
 * minutes out, so you can prove a notification reaches your phone and
 * watch. Deliberately ignores quiet hours — it is a test.
 */
function testProteinAlert_(payload) {
  var minutes = Math.max(1, Math.min(60, num_(payload && payload.minutes, 2)));
  var cal = getProteinCalendar_();
  if (!cal) return { ok: false, error: 'no_calendar' };

  // Clear any earlier test so they do not pile up.
  var now = new Date();
  var soon = new Date(now.getTime() + 2 * 3600000);
  cal.getEvents(now, soon).forEach(function (ev) {
    if (String(ev.getTitle()).indexOf(PROTEIN_TEST_TITLE) === 0) ev.deleteEvent();
  });

  var at = new Date(Date.now() + minutes * 60000);
  var event = cal.createEvent(PROTEIN_TEST_TITLE, at, new Date(at.getTime() + 5 * 60000));
  event.removeAllReminders();
  event.addPopupReminder(0);

  return {
    ok: true,
    minutes: minutes,
    at: at.toISOString(),
    atLocal: Utilities.formatDate(at, tz_(), 'h:mm a'),
    calendar: cal.getName()
  };
}

function getProteinCalendar_(settings) {
  settings = settings || readSettings_();
  var id = String(settings.calendar_id || '').trim();
  if (id) {
    try {
      var byId = CalendarApp.getCalendarById(id);
      if (byId) return byId;
    } catch (e) {}
  }
  var found = CalendarApp.getCalendarsByName(PROTEIN_CALENDAR_NAME);
  if (found && found.length) {
    writeSetting_('calendar_id', found[0].getId());
    return found[0];
  }
  return null;
}

function clearFutureProteinEvents_(cal) {
  var now = new Date();
  var horizon = new Date(now.getTime() + 14 * 24 * 3600000);
  var events = cal.getEvents(now, horizon);
  var removed = 0;
  for (var i = 0; i < events.length; i++) {
    if (String(events[i].getTitle()).indexOf(PROTEIN_EVENT_PREFIX) === 0) {
      events[i].deleteEvent();
      removed++;
    }
  }
  return removed;
}

/** Minutes past midnight, from "22:00" or a time value the sheet coerced. */
function parseHm_(value, fallbackMinutes) {
  if (value === '' || value === null || value === undefined) return fallbackMinutes;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return value.getHours() * 60 + value.getMinutes();
  }
  var m = String(value).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return fallbackMinutes;
  return (parseInt(m[1], 10) * 60) + parseInt(m[2], 10);
}

function inQuietHours_(when, settings) {
  settings = settings || readSettings_();
  var zone = tz_();
  var mins = parseInt(Utilities.formatDate(when, zone, 'H'), 10) * 60
           + parseInt(Utilities.formatDate(when, zone, 'm'), 10);
  var start = parseHm_(settings.quiet_start, 22 * 60);
  var end = parseHm_(settings.quiet_end, 6 * 60);
  if (start === end) return false;
  if (start < end) return mins >= start && mins < end;
  return mins >= start || mins < end;
}
