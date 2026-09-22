# Phase 1 setup — your sheet and its API

This gets your Google Sheet built and connected. There's no app yet — that's Phase 2.
Budget about 15 minutes. You don't need to understand any of the code.

At the end you'll have two things written down:

- **Your API token** — a 32-character password
- **Your web app link** — a long `https://script.google.com/...` URL

Keep both. You'll type them into the app once in Phase 2, and never again.

---

## Step 1 — Make the spreadsheet

1. Go to **sheets.new** in your browser (that makes a fresh blank spreadsheet).
2. Click the title at the top left, where it says "Untitled spreadsheet".
3. Name it **Health Tracker**.

That's it. Don't add any tabs or headings — the script builds all of that.

## Step 2 — Open the script editor

1. In that spreadsheet, click **Extensions** in the top menu.
2. Click **Apps Script**.
3. A new tab opens with a code editor. There's one file in it called `Code.gs`, with a few lines of sample code.
4. Click the title at the top left ("Untitled project") and name it **Health Tracker API**.

## Step 3 — Paste in the four code files

You're going to end up with four files. The editor already has the first one.

**File 1 — `Code.gs`**

1. Click on `Code.gs` in the left sidebar.
2. Select everything in the editor (click in the code, then press `Ctrl+A`) and delete it.
3. Open `apps-script/Code.gs` from this folder, copy all of it, and paste it in.

**Files 2, 3, and 4**

For each of the remaining files:

1. Click the **+** next to "Files" in the left sidebar, then click **Script**.
2. Type the name exactly — the editor adds the `.gs` part itself:
   - `Setup`
   - `Summaries`
   - `ProteinClock`
3. Delete the few lines of sample code it puts there.
4. Paste in the matching file from the `apps-script` folder.

When you're done the sidebar should list exactly: `Code.gs`, `Setup.gs`, `Summaries.gs`, `ProteinClock.gs`.

**Now save:** press `Ctrl+S`, or click the floppy-disk icon.

### Optional: set the time zone

1. Click the gear icon (**Project Settings**) in the far-left sidebar.
2. Under "Time zone", choose **(GMT-05:00) Eastern Time**.

The script sets this itself when it runs, so you can skip it. It's just belt and braces.

## Step 4 — Run setup

1. Click **Editor** (the `<>` icon) in the far-left sidebar to get back to the code.
2. At the top of the editor there's a dropdown that probably says `doGet`. Click it and choose **setup**.
3. Click **Run**.

**Google will now ask for permission.** This part looks alarming and is completely normal — you're approving your own script, not somebody else's:

1. Click **Review permissions**.
2. Pick your Google account.
3. You'll see "**Google hasn't verified this app**". Click **Advanced** at the bottom left.
4. Click **Go to Health Tracker API (unsafe)**.
5. Click **Allow**.

It's flagged "unverified" only because it's a private script that hasn't been through Google's review process for public apps. It's your code, running in your account, touching your own sheet and calendar.

After it runs, a box pops up with your **API token** — 32 letters and numbers.

**Copy that token somewhere safe right now.** Your password manager, or the Notes app. You'll need it in Phase 2.

(Lost it? In the function dropdown pick **showToken** and click Run.)

### What you should see in the sheet

Switch back to the spreadsheet tab and check that you now have these 11 tabs along the bottom:

`Food` · `Fluids` · `Activity` · `Steps` · `Body` · `Symptoms` · `SavedFoods` · `Settings` · `TargetHistory` · `DailySummary` · `WeeklySummary`

Click through a few:

- **SavedFoods** should have your 24 road orders and snacks.
- **Settings** should have 28 rows — all your targets, the 2,900–3,000 calorie range, the protein clock settings, quiet hours.
- **DailySummary** and **WeeklySummary** will look empty except for headers. That's right — they fill in on their own once you start logging.

### Check the calendar

Go to **calendar.google.com**. In the left sidebar under "My calendars" you should now see **Protein Clock**. It's empty for now.

If it isn't there, go back to the script editor, run **setup** again, and approve the calendar permission when asked.

## Step 5 — Prove the API works

Still in the script editor:

1. In the function dropdown, choose **runSelfTest**.
2. Click **Run**.

A box appears with five lines. You want to see:

```
1. First write   -> created     (expected: created)
2. Same id again -> duplicate   (expected: duplicate)
3. Protein clock -> event at <a time about 4 1/2 hours from now>
4. Bootstrap     -> 1 food rows, 24 saved foods, 28 settings
5. Cleanup       -> deleted     (expected: deleted)
```

Line 2 is the important one. It proves that if your phone loses signal and re-sends the same entry later, you get **one** row in the sheet, not two.

Line 3 will say `not scheduled (quiet_hours)` instead if you're running this late at night. That's correct behavior, not a failure.

The test cleans up after itself — the Food tab should be empty again when it's done.

## Step 6 — Deploy it as a web app

This is what gives your phone a link to talk to.

1. In the script editor, click **Deploy** (top right) → **New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Fill in:
   - **Description:** `v1`
   - **Execute as:** **Me** (your email)
   - **Who has access:** **Anyone**
4. Click **Deploy**.
5. Approve permissions again if asked.
6. Copy the **Web app URL**. It's long and ends in `/exec`.

**Save that URL with your token.** You'll need both in Phase 2.

### About "Who has access: Anyone"

This sounds wide open, and it's worth understanding why it isn't. "Anyone" means the link works without a Google login — which is what lets your phone reach it. But every single request has to carry your 32-character token, and the script rejects anything without it. Somebody would need both the exact URL and the exact token. You're going to verify this in the next step.

## Step 7 — Test the link from your browser

1. Paste your web app URL into the address bar, then add this to the end:

   ```
   ?action=ping&token=WRONG
   ```

   Press Enter. You should see:

   ```json
   {"ok":false,"error":"unauthorized"}
   ```

   Good — that's the lock working.

2. Now replace `WRONG` with your real token and reload. You should see:

   ```json
   {"ok":true,"version":"1.0.0","serverTime":"2026-09-22T19:20:11-04:00"}
   ```

If you get both of those, Phase 1 is done and working.

3. One more, to see your actual data come back. Add this to the end of the URL instead, using your real token:

   ```
   ?action=bootstrap&token=YOURTOKEN
   ```

   You'll get a wall of JSON — your settings, your 24 saved foods. It's meant to look like that. Your phone will read this and turn it into the Today screen.

---

## Getting the alerts onto your phone and watch

Do this now so it's ready when the protein clock goes live in Phase 3.

1. Install the **Google Calendar** app on your iPhone if it isn't there.
2. Sign in with the same Google account that owns the sheet.
3. In the app: **☰ menu → Settings → Protein Clock**, and make sure the calendar is **checked/visible**.
4. Still in Settings, under **Notifications**, make sure notifications are allowed.
5. On the iPhone: **Settings → Notifications → Google Calendar** → Allow Notifications **on**, and turn on **Time Sensitive** notifications if offered.
6. On the Apple Watch: **Watch app → Notifications → Google Calendar** → set to **Mirror my iPhone**.

We'll run a live 2-minute alert test in Phase 3, once the app can log a protein item for you.

---

## Two things worth knowing

**When the code changes, you have to redeploy.** Saving the code isn't enough — the live link keeps running the old version until you publish a new one. In Phase 2 and 3 I'll say "redeploy" and this is what I mean:

> **Deploy → Manage deployments** → pencil icon → **Version: New version** → **Deploy**

Use **Manage deployments**, not **New deployment** — that way your URL stays the same and you don't have to retype it into the app.

**Back up the sheet.** Your data lives in one spreadsheet. Once in a while: **File → Make a copy**, and name it something like `Health Tracker backup 2026-09-22`. Google keeps full version history too (**File → Version history**), so an accidental delete is recoverable.

---

## If something goes wrong

**"Missing tab Food. Run setup() first."** — setup didn't finish. Run it again and watch for a permission prompt.

**The permission screen won't let me through.** — You have to click **Advanced**, then the "Go to... (unsafe)" link. There's no other path for a private script.

**`?action=ping` shows a Google login page instead of JSON.** — The deployment's "Who has access" is set to something other than **Anyone**. Fix it in **Manage deployments**.

**Everything returns `unauthorized` even with the right token.** — Most likely a copy-paste problem: a trailing space, or a character dropped. Run **showToken** and copy it again.

**The Protein Clock calendar never appeared.** — The calendar permission wasn't granted. Run **setup** again and approve it.
