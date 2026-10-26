# Th7

The Th7 board: everyone's weekly schedule, who's free together, gyms and libraries on a live map (with closing times), workout and study proposals, events and night-out spots, check-ins, points, streaks and a leaderboard.

**Live site:** https://r354306-cloud.github.io/th7/

## How it works
- The site is plain HTML/CSS/JS hosted on GitHub Pages.
- Everything saves to the **Th7 Board** Google Sheet through a small Google Apps Script web app (`backend/Code.gs`).
- Changes save instantly on the phone, queue up if someone is offline, and retry until the sheet confirms. Retries never double-save.
- Every change is also written to the sheet's **Log** tab, and the **Free Grid** tab shows who's free when in plain text.

## Change the passcode
Open the Th7 Board sheet, go to the **Settings** tab, and change the value next to `passcode`. No redeploy needed.

## Update gym or library hours
Edit `places.js` (hours are minutes after midnight, Monday first). Hours were pulled from the official pages the week of Oct 26, 2026.

## Photos
Mirror Lake: Wikimedia Commons (CC0). Thompson Library: Michael Barera, CC BY-SA 4.0, Wikimedia Commons.
Map tiles: Esri, HERE, Garmin, OpenStreetMap contributors.
