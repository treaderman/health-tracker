# Health Tracker

A fast tracker for food, water and activity that writes to a Google Sheet you own.
Built for logging in under ten seconds, from a truck, with one thumb, on bad signal.

No mood tracking. No hunger scales. No journaling. No streaks or badges.

**Status: Phase 1 is built and live.** The sheet and its API are working. The phone
app is Phase 2.

---

## What exists right now

| Piece | Where |
|---|---|
| Your spreadsheet | Google Drive, named **Health Tracker** |
| The code that runs it | Apps Script project named **Health Tracker API** |
| Your web app link | Given to you in chat — keep it with your token |
| Your API token | Given to you in chat — treat it like a password |

**Neither the link nor the token is in this repo, and neither should ever be put
here.** This repo is public. Your data is not — it lives only in your private sheet.

The sheet's ID does appear in the live copy of `Code.gs`, but not in this repo.
That ID is not a password; it is just the sheet's name in Google's filing system,
and the sheet stays private either way.

---

## The tabs in your sheet

| Tab | What goes in it |
|---|---|
| **Food** | every item you log, with calories, protein, and fruit/veg flags |
| **Fluids** | every drink, with whether it counts toward your target |
| **Activity** | walks, strength sessions, anything else, in minutes |
| **Steps** | one row per day |
| **Body** | weight, and waist if you take it |
| **Symptoms** | one-tap chips, default None |
| **SavedFoods** | your 24 road orders and snacks, sorted by how often you use them |
| **Settings** | every target and preference |
| **TargetHistory** | a dated record of each change, one row per nutritionist visit |
| **DailySummary** | calculates itself — one row per day |
| **WeeklySummary** | calculates itself — one row per week, weeks start Sunday |

The two summary tabs are formulas, not saved numbers. They update on their own as
entries arrive. You never refresh anything.

---

## Changing your targets

Once the app exists (Phase 2), you change targets on the Settings screen and it
writes a TargetHistory row for you.

Until then, edit the **Settings** tab directly. Find the row by its key in column A
and change column B.

| Key | Means | Now |
|---|---|---|
| `cal_low` / `cal_high` | calorie target range | 2900 / 3000 |
| `protein_low` / `protein_high` | protein target range, grams | 125 / 185 |
| `fluid_low` / `fluid_high` | fluid target range, ounces | 103 / 124 |
| `cal_min` / `protein_min` / `fluid_min` | the minimums that rarely change | 1500 / 60 / 64 |
| `activity_min_week` | weekly activity minutes | 150 |
| `walks_per_week` / `walk_minutes` | walk goal | 3 / 20 |
| `goals_text` | the goals shown on the Today screen | your two current goals |
| `coke_zero_counts` | whether Coke Zero counts toward fluids | FALSE |
| `protein_threshold_g` | protein that counts as a protein meal | 10 |
| `protein_window_hours` | how long the protein window is | 5 |
| `protein_alert_lead_min` | how early the alert fires | 30 |
| `quiet_start` / `quiet_end` | no alerts between these times | 22:00 / 06:00 |
| `day_rollover_hour` | when a new day starts, so late meals count as tonight | 3 |
| `under_min_amber_after_hour` | when a bar turns amber for being under the minimum | 18 |

Changing `coke_zero_counts` affects **future** entries only. Past weeks keep whatever
they were logged with, so your history never silently re-totals.

---

## The protein clock

Log food with 10 g of protein or more and the script puts a single event on a
calendar called **Protein Clock**, four and a half hours later, titled
"Protein window — 30 min left", with a popup reminder at the event time.

There is never more than one of these. Logging protein again moves it. If the alert
would land between 10 PM and 6 AM it is skipped.

**To make the alert actually reach your iPhone and Apple Watch:**

1. Install the **Google Calendar** app and sign in with the same Google account.
2. In the app: **☰ menu → Settings**, find **Protein Clock**, and make sure it is
   turned on and its notifications are allowed.
3. iPhone **Settings → Notifications → Google Calendar** → Allow Notifications on,
   and **Time Sensitive** on if offered.
4. Apple Watch app → **Notifications → Google Calendar** → **Mirror my iPhone**.

The Protein Clock calendar exists but may not be ticked in your calendar list yet.
On calendar.google.com, look under "My calendars" and tick it so you can see the
events. We run a live two-minute alert test in Phase 3.

---

## Backing up the sheet

Your data lives in one spreadsheet, so give yourself a copy now and then.

- **File → Make a copy**, named something like `Health Tracker backup 2026-09-22`.
- Google also keeps full history: **File → Version history → See version history**.
  An accidental delete is recoverable from there.

---

## When something looks wrong

**A total on the phone disagrees with the sheet.** In the Apps Script editor, pick
**checkSummaries** from the function dropdown and press Run. It prints exactly what
DailySummary and WeeklySummary have worked out.

**You want to prove the API still works.** Run **runSelfTest**. It writes one entry,
writes it again to confirm the duplicate is refused, then deletes it. Three lines
tell you whether it is healthy.

**You lost your token.** Run **showToken**.

**You think your token leaked.** Run **resetToken**, then put the new one in the app's
Settings screen. The old one stops working the moment you run it.

**Everything returns `unauthorized`.** Almost always a copy-paste problem — a trailing
space or a dropped character. Run `showToken` and copy it again.

**The link returns a Google login page instead of data.** The deployment's "Who has
access" got changed off **Anyone**. Fix it in **Deploy → Manage deployments**.

---

## If you ever change the code

Saving is not enough. The live link keeps running the old version until you publish
a new one:

> **Deploy → Manage deployments** → pencil icon → **Version: New version** → **Deploy**

Use **Manage deployments**, not **New deployment** — that keeps your URL the same so
you never have to retype it into the app.

---

## Repo layout

```
health-tracker/
├─ apps-script/
│  ├─ Code.gs           the API: routing, token check, reads and writes
│  ├─ Setup.gs          setup(), the seed data, and the diagnostics
│  ├─ Summaries.gs      the DailySummary and WeeklySummary formulas
│  ├─ ProteinClock.gs   the calendar alert
│  └─ appsscript.json   project manifest
├─ SETUP-PHASE1.md      how to build all of this from scratch
└─ README.md            this file
```

Phase 2 adds the phone app at the repo root, served by GitHub Pages.

---

## How it is built, in short

The phone app will be plain HTML, CSS and JavaScript — no build step and no
framework, so any file can be opened and read.

Entries queue on the phone in IndexedDB and sync when signal returns. **Every entry
carries a unique ID generated on the phone**, and the script refuses an ID it has
already seen, so a re-send after a dropped connection can never double-log. This is
tested both offline and against the live sheet.

Requests POST as `text/plain` with the token in the body, which is what gets around
Apps Script's CORS limits without a preflight the platform cannot answer.

Dates are stored as plain text like `2026-09-22`, never as spreadsheet dates. Sheets
will silently convert a date-shaped string on write, which breaks the summary
formulas and the date filtering, so every write sets the cell to plain text first and
every read converts anything that slipped through.
