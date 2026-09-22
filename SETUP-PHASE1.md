# Building the sheet and its API from scratch

**You do not need to do this.** It is already set up and working. Keep this in case
you ever need to rebuild — a new Google account, a fresh start, or a sheet that got
into a state you would rather walk away from.

About 15 minutes. No developer knowledge assumed.

---

## Step 1 — Make the spreadsheet

1. Go to **sheets.new**. That makes a fresh blank spreadsheet.
2. Click the title at the top left where it says "Untitled spreadsheet".
3. Name it **Health Tracker**.

Don't add any tabs or headings — the script builds all of that.

## Step 2 — Copy the sheet's ID

Look at the web address of your new sheet. It looks like this:

```
docs.google.com/spreadsheets/d/1maafdKNFxdapMwKxP4oL3UfVtsIPcrEa0BAxR88ivFs/edit
                              └──────────── this long middle part ────────────┘
```

Copy that middle part. That's the sheet's ID. It isn't a password — it's just the
sheet's name in Google's filing system — but you need it in a moment.

## Step 3 — Make the script project

1. Go to **script.google.com**.
2. Click **New project**.
3. Click the title at the top left and rename it **Health Tracker API**.

> **Why not Extensions → Apps Script from inside the sheet?** That makes a script
> attached to the sheet, which also works. A standalone project is used here because
> it can be driven from a browser tab, and because it survives if the sheet is
> copied. The code supports both.

## Step 4 — Paste in the four code files

You'll end up with four files. The editor starts with one.

**File 1 — `Code.gs`**

1. Click `Code.gs` in the left sidebar.
2. Click in the code, press `Ctrl+A`, delete it.
3. Copy all of `apps-script/Code.gs` from this repo and paste it in.
4. Near the top, find this line:

   ```javascript
   var SPREADSHEET_ID = '';
   ```

   Put your sheet ID from Step 2 between the quotes:

   ```javascript
   var SPREADSHEET_ID = 'your-long-sheet-id-here';
   ```

**Files 2, 3 and 4**

For each one:

1. Click the **+** next to "Files" in the sidebar, then **Script**.
2. Type the name exactly — the editor adds the `.gs` itself:
   `Setup`, then `Summaries`, then `ProteinClock`.
3. Delete the sample code it puts there.
4. Paste in the matching file from `apps-script/`.

Press `Ctrl+S` to save. The sidebar should now list exactly `Code.gs`, `Setup.gs`,
`Summaries.gs`, `ProteinClock.gs`.

## Step 5 — Run setup

1. In the dropdown at the top (it probably says `doGet`), choose **setup**.
2. Click **Run**.

**Google will ask for permission**, and this part looks alarming. It is normal — you
are approving your own script:

1. Click **Review permissions** and pick your Google account.
2. You'll see **"Google hasn't verified this app."** Click **Advanced** at the
   bottom left, then **Go to Health Tracker API (unsafe)**.
3. Click **Allow**.

"Unverified" means the publisher hasn't been through Google's review for public apps.
It's your code, in your account, touching your own sheet and calendar. Every private
script shows this.

It asks for broad-sounding access to Sheets and Calendar because Google has no
"just this one sheet" permission — it's all-or-nothing per service. The code only
ever touches the one sheet ID and the one calendar named Protein Clock.

When it finishes, a box shows your **API token** — 32 letters and numbers.
**Copy it somewhere safe.** (Lost it later? Run **showToken**.)

### Check the sheet

You should now have 11 tabs:

`Food` · `Fluids` · `Activity` · `Steps` · `Body` · `Symptoms` · `SavedFoods` ·
`Settings` · `TargetHistory` · `DailySummary` · `WeeklySummary`

**SavedFoods** should hold 24 items. **Settings** should hold 28 rows. The two
summary tabs look empty apart from headers — correct, they fill in once you log.

At calendar.google.com you should find a new **Protein Clock** calendar. Tick it in
"My calendars" so its events show.

## Step 6 — Prove it works

In the dropdown choose **runSelfTest** and click **Run**. You want:

```
1. First write   -> created     (expected: created)
2. Same id again -> duplicate   (expected: duplicate)
3. Protein clock -> event at <about 4 1/2 hours from now>
4. Bootstrap     -> 1 food rows, 24 saved foods, 28 settings
5. Cleanup       -> deleted     (expected: deleted)
```

Line 2 is the one that matters. It proves that if your phone loses signal and
re-sends the same entry later, you get **one** row, not two.

Line 3 saying `not scheduled (quiet_hours)` instead is correct behaviour if you're
running this late at night.

The test cleans up after itself.

## Step 7 — Deploy it as a web app

This is what gives your phone something to talk to.

1. **Deploy** (top right) → **New deployment**.
2. Click the gear next to "Select type" → **Web app**.
3. Fill in:
   - **Description:** `v1`
   - **Execute as:** **Me**
   - **Who has access:** **Anyone**
4. **Deploy**, approve permissions if asked, then copy the **Web app URL**. It ends
   in `/exec`.

Save that URL with your token.

### About "Anyone"

It sounds wide open. "Anyone" means the link works without a Google login, which is
what lets your phone reach it. Every request still has to carry your 32-character
token and the script refuses anything without one. Someone would need both the exact
URL and the exact token. You verify this next.

## Step 8 — Test the link

Paste your web app URL in the address bar and add to the end:

```
?action=ping&token=WRONG
```

You should get:

```json
{"ok":false,"error":"unauthorized"}
```

Now swap `WRONG` for your real token and reload:

```json
{"ok":true,"version":"1.0.0","serverTime":"2026-09-22T06:40:26-04:00"}
```

Both of those, and you're done.

For a look at real data, try `?action=bootstrap&token=YOURTOKEN` — a wall of JSON
with your settings and saved foods. It's meant to look like that; the phone turns it
into the Today screen.

---

## If something goes wrong

**"Missing tab Food. Run setup() first."** — setup didn't finish. Run it again and
watch for a permission prompt.

**"No spreadsheet found."** — `SPREADSHEET_ID` in `Code.gs` is empty or wrong. Redo
Step 2 and Step 4.

**The permission screen won't let me through.** — You have to click **Advanced**,
then the "Go to… (unsafe)" link. There's no other path for a private script.

**`?action=ping` shows a Google login page.** — "Who has access" isn't **Anyone**.
Fix it in **Deploy → Manage deployments**.

**Everything says `unauthorized` even with the right token.** — Usually a trailing
space or a dropped character. Run **showToken** and copy it again.

**No Protein Clock calendar.** — The calendar permission wasn't granted. Run
**setup** again and approve it.

---

## Remember: changing the code needs a redeploy

Saving isn't enough — the live link keeps serving the old version:

> **Deploy → Manage deployments** → pencil → **Version: New version** → **Deploy**

Use **Manage deployments**, not **New deployment**, so your URL stays the same.
