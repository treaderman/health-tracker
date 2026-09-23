# Putting the app on your iPhone

Five minutes. Do it once.

**The app lives at:**

```
https://treaderman.github.io/health-tracker/
```

---

## Step 1 — Open it in Safari

It has to be **Safari**, not Chrome. Only Safari can add an app to your home
screen on an iPhone.

Type that address into Safari, or text yourself the link and tap it.

You'll land on the **Settings** screen, because the app doesn't know how to reach
your sheet yet.

## Step 2 — Connect it to your sheet

Two boxes to fill. Both came from setup, and you'll never type them again.

- **Web app link** — the long `https://script.google.com/macros/s/…/exec` address
- **Secret token** — the 32 letters and numbers

Easiest way to get them in without typos: email or text them to yourself, then
copy and paste. Tap **Save and test**.

You want to see **"Connected and up to date."**

If it says something else, see the bottom of this page.

## Step 3 — Add it to your home screen

1. Tap the **Share** button — the square with an arrow coming out the top, in the
   bar at the bottom of Safari.
2. Scroll down the list and tap **Add to Home Screen**.
3. The name will already say **Health**. Tap **Add**.

You now have a Health icon on your home screen — a blue square with three white
bars. Open it from there from now on, not from Safari. Opened that way it runs
full screen with no browser bars, and it holds on to your entries better.

---

# Test checklist

Run this once on your phone. Ten minutes, and it proves the parts that matter.

### The basics

- [ ] Open the Health icon from your home screen. **Today** appears, no Safari bars.
- [ ] The three bars show your real targets underneath: min 1,500 · target 2,900–3,000.
- [ ] Your two goals are showing near the bottom.

### Logging

- [ ] Tap **Water**, tap **+20 oz**. You land back on Today and Fluids reads 20 oz.
- [ ] Tap **Food**, type `cane` in the search box, tap the Raising Cane's chip once.
      The form fills in — 210 calories, 39 g protein.
- [ ] Tap the same chip again. It logs and you're back on Today showing 210 calories.
- [ ] Tap **Activity**, leave it on Walk, tap **20 min**. Minutes reads 20 of 150.
- [ ] Open your Google Sheet. All three entries are there.

### The one that actually matters — no signal

- [ ] Turn on **Airplane Mode**.
- [ ] Log three things: a water, a food, an activity.
- [ ] Each one saves instantly. **Today's numbers go up right away.**
- [ ] At the top right it now says **"3 waiting to sync."**
- [ ] Close the app completely — swipe up from the bottom and flick it away.
- [ ] Reopen it. It still says 3 waiting. **Nothing was lost.**
- [ ] Turn Airplane Mode off. Wait a few seconds, or tap the badge.
- [ ] The badge disappears.
- [ ] Open your sheet. **Exactly three new rows** — not six.

That last line is the whole point. Re-sending can't double-log, because every
entry carries an ID your phone made and the sheet refuses an ID it already has.

### Editing

- [ ] On the **Food** screen, find an entry under "Today's food" and tap **Edit**.
      Change the calories and tap **Save changes**. The number updates on Today.
- [ ] Tap **Delete** on an entry. It disappears, and disappears from the sheet too.

### Dark mode

- [ ] iPhone **Settings → Display & Brightness → Dark**. Open the app. It follows.

---

## If something's wrong

**"The token was refused."** — A character got lost in the copy. Open the Apps
Script editor, run **showToken**, and paste it again.

**"Got a sign-in page instead of data."** — The deployment's "Who has access"
isn't set to **Anyone**. Fix it in **Deploy → Manage deployments**.

**Entries stay stuck on "waiting to sync."** — Normal with no signal; they go when
you have bars. If you *do* have signal and they're still stuck, open Settings and
tap **Sync now** — it'll tell you what's wrong instead of failing quietly.

**Nothing is showing on Today but the sheet has rows.** — Settings → **Refresh
from sheet**.

**You want to start over on the phone.** — Delete the icon, open the link in
Safari again, and re-enter the two boxes. Nothing in your sheet is affected.
Anything still waiting to sync would be lost, so sync first.
