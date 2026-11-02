# Plot planner - Acton Gardening Association

Site maps for the allotments: plot numbers, paths, sheds, water and jobs, with a card per plot. Static page, no frameworks, no accounts, works on a phone.

**Status (2 Nov 2026).** Bromyard (numbers confirmed), Chestnuts and Perryn (from Claire's drawing, reps to confirm) are drawn; the Vale shows its boundary only until Goran marks the plots. The plot card shows where details would sit; it holds none.

## The rule this page follows

Nothing about plot holders lives here. The map knows plot numbers and where things are. Everything about a plot (holder, rent, checks, photos, flags, notes) stays in the committee's own record and is looked up by plot number. That keeps this page safe to publish and keeps one record, not two.

## Files

- `index.html` - the page and its styles
- `planner.js` - draws the map from the data and handles taps
- `jobs.html`, `jobs.js` - the job board: every site's jobs on one page, with Print (see below)
- `jobedit.js` - the four job statuses, the edit form and the offline edit queue, shared by the map and the job board
- `data/sites.js` - one entry per site: base image, plots, paths, markers, jobs. Positions are pixels of the site's base image
- `img/` - base satellite images (Google Earth; credit shown on the page)

## Updating

- **Plot numbers or shapes:** edit the plot's entry in `data/sites.js` (`id`, `kind`, `cx`, `cy`, `w`, `h`, `ang`), or regenerate from the association's `maps/<site>/*.csv` files.
- **Sheds, water, gates, jobs:** the `markers` and `jobs` lists in the same file.
- **A new site:** add an entry to the list with its own base image in `img/`.

## How the page works

The right-hand panel shows whatever was last tapped:

- **A plot** - its card, with "Add / edit notes" (opens the check form for that plot).
- **Jobs** (the chip) - the site's jobs, open ones first, each with a status. "Log a job" is also at the top of the page.
- **A job** (tap its pin or its row) - what, where, how soon, who logged it, photo, and the job's latest position (status, who has it, money, what it is blocked by, expected by, latest line). "Edit this job" opens a form for every field; Save sends one `job-edit` message with only what changed. "Move pin" puts the pin wherever you tap next, on a plot or off one, then Save pin; only the pin moves. One pin per job. A link of the form `index.html?site=Bromyard&job=J3` opens that job on its pin. Statuses: Pending, Arranged, Done, Not doing (blank reads as Pending).
- **Log a job** - what, a line more, how soon, near which plot, pin it on the map (tap), optional photo, your name.

Jobs logged on a phone are sent to the "Jobs" tab of the association sheet and read back, so every phone shows the same list. An edit made with no signal waits on the phone (`aga-edits-<site>`), shows on the row as "Not sent yet", and goes next time the planner opens with a connection or when "Send it now" is tapped. One row per job, no history: the row is the record. The three Bromyard jobs from the sketch (J1-J3) are put into the Jobs tab by the receiver's setup.

## Job board (`jobs.html`, 2 Nov 2026)

Every site's jobs on one page, behind the members' password, for the committee's standing "Site jobs" item. The board is a log, not a project record: it holds the latest position on each job and nothing of what came before (the minutes do that). The process it serves is in the project folder, `22-site-jobs-process.md`.

- **Columns**, in the order they print: Ref, Site, Job, Status, Who, Money, Blocked by, Expected by, Latest, Logged, Urgent. Detail and the photo sit under the row when it is tapped.
- **Status** is one of four: Pending (logged, nothing arranged - the list the committee looks at), Arranged (a person, work morning or contractor is booked; Expected by says when), Done (date in Latest; hidden behind "Show finished") and Not doing (reason in Latest). The old ladder (Logged, Needs approval, Approved, Done, Not doing) collapsed into this: the first three all became Pending.
- **Money** is No, Needs approval or Approved. The amount goes in Latest; what was actually paid is the treasurer's record, not the board.
- **Who** is the person or group dealing with it, blank if nobody yet. **Blocked by** names what has to happen first; if it names a person, that is who to chase.
- **Editing.** Tap a row to change status, who, money, blocked by, expected by, latest, how soon and detail, or add a photo after logging. Anyone with the members' password or a rep link can edit, about ten people; admin-only editing is parked. The committee can also type straight into the Jobs tab: Status and Money have dropdowns there, and whatever is in the sheet is what the board shows.
- **Print** gives an A4 landscape list, Pending first, urgent at the top, grouped by site.
- **Offline.** An edit made with no signal shows on its row as "Not sent yet" and goes when there is one, or when "Send it now" is tapped on the job.
- **Moving a pin** is done on the map: the row has a "Move the pin on the map" link that opens the job there. On a phone each job is a card. Shared code for both pages is in `jobedit.js`.

In the sheet, the Jobs tab keeps the columns the planner already used (Id, Code, Logged, By, Site, What, Detail, How soon, Near plot, X, Y, Photo, Received, Photo status, Remove photo (committee), Plot item) and adds Status, Who, Money, Blocked by, Expected by and Latest on the end. A blank Status reads as Pending and a blank Money as No. The "Job updates" tab the earlier version kept is retired: setup copies each job's last status and note into the new columns once, renames the tab "Job updates (old)", and nothing reads or writes it after that.

## Moving around the map (2 Nov 2026)

Drag with one finger to move the map and pinch with two to zoom (or use the + and - buttons in the corner; Fit shows the whole site again). On a long site, buttons above the map jump to one part of it; these come from each site's `views` list in `data/sites.js` (`label`, `x`, `y`, `w`, `h` in image pixels, the first always the whole site). The walk sheet prints one map page per view. A link of the form `index.html?site=Chestnuts&plot=12` opens with that plot's card showing and the map zoomed in on it. Gates show with the Paths layer; job pins show while Jobs, a job or Log a job is open. A site's `markersDraft` list is kept but not drawn: Bromyard's gate, tap and tank positions sit there until a walk confirms them.

## Site dashboard (`dashboard.html`)

What a rep needs to do on their site, at a glance: plots, rent not paid in full, no email, no phone, open jobs, plots checked this season, warnings on record, record issues. Under the tiles, a to-do list in priority order (urgent jobs, rent, plots to check, emails, phones, jobs for the committee). "All sites (committee)" shows the same counts as one table.

The counts come from `data/dashboard.js`, which is **numbers only**, made from the committee record by a script that lives in the association's private project folder (not in this repo). Nothing on this page names anyone. *Which* plots are behind a number is personal, so that list is not here: it will come from a private link per rep served by the receiver (next step, below).

## Walk sheet (`print.html`)

Printable, per site: the numbers-only map on page one where a site is drawn, then a table with a row per plot from the record and the answers to circle (looks, shed, greenhouse, polytunnel, water, flags, notes). For walking a site on paper and filing afterwards. A4 portrait; the Print button uses the browser's print dialog.

## Plot check form (`check.html`)

The rep's form, with no sign-in. The map is the menu: tap a plot, "Check this plot", answer, send, back to the map for the next one. The name is remembered on the phone after the first entry. Questions: how it looks; shed? (if yes: good condition / needs roof repair / unsafe, needs removing); greenhouse?; polytunnel?; water harvesting? (if yes: gutters, butt connected, butt not connected, other container); anything else to flag; a photo; a line.

Built for walking a whole site: after Send, "Next: plot 8" moves straight to the next number. If there is no signal - or no receiver yet - the entry is saved on the phone (photo included, about 150 KB each) and "Send waiting entries" posts the lot when there is one; the page also tries on its own next time it loads with a connection. The page shrinks the photo on the phone (longest edge 1280 px, about 150 KB, which also strips location data; job photos the same), then posts one message to a small Apps Script in the association's Google account. That script files the photo in Drive as `Plot checks / <Site> / Plot <n> / <date> <who>.jpg` and appends a row to the "Plot checks" sheet, so everything is filed the moment it arrives. Nothing to move afterwards.

- Script: `apps-script/Code.gs`, with its set-up steps at the top. It needs the association account to authorise it once.
- Connect: paste the web app URL into `data/config.js` as `submitUrl` and redeploy. Until then the form shows "not connected yet" and sends nothing.
- A rep's own link pre-fills who and site: `check.html?who=Jon%20Snow&site=Bromyard`. Save it to the phone home screen.
- Plot lists per site are in `data/plots.js`, from the association's record.

Limits worth knowing: the web app URL is public, so anyone who finds it could post an entry (there is no login by design); the sheet shows who claimed to send it. Photos tied to plots are committee material: the Drive folder stays private to the committee.

### Latest state per plot, and who can see it (27 Oct 2026)

- **Two layers in the sheet.** `Entries` is the history: one row per check, never edited. `Current` is one row per plot with the latest state, and is what the map card shows. Each check updates Current: answers given overwrite, answers left blank keep what was there, so a quick note does not wipe the shed or water answers. The committee can correct Current by typing into it.
- **Nothing is required** beyond site and plot. A note on its own, or a photo on its own, is a valid check.
- **Pre-filled.** With a rep key on the phone, "Add / edit notes" opens with the plot's current answers ticked and the latest note in the box. Change what is different and Send. Sending with no changes still records the date of the check.
- **Who sees check details.** The page is public, so plot condition, flags, notes and photos show only on a phone that holds a rep key. Keys live in the `Rep links` tab: type a name and a site (or `All`) on a new row and the key and link fill themselves in. Send the rep their link; opening it once is enough. Set `Active` to `No` to switch a link off. Without a key the card says check details are for reps and the committee.
- **The submitter is labelled** "Person submitting edits" on the form and "Checked by" on the card, so nobody reads it as the plot holder.

### Status pills (27 Oct 2026)

`pills.js` draws the same pills on the map card and the form. Items: Plot, Shed, Greenhouse, Polytunnel, Water, Fruit trees. Status: Fine (green circle), May need a hand (amber triangle), Unsafe (red square - only when something could fall or hurt someone), Not there (dashed, hidden on the card), Not checked (grey). Amber and red take reasons, tick all that apply or own words, and an optional help request with one sentence; the receiver turns a new or changed help request into a site job coded H1, H2..., and clears the "help asked" marker when that job is Done or Not doing. In the sheet, Current has `<Item> status`, `<Item> - why` and `<Item> - help` per item; the status cells have a dropdown. Entries keeps the older look / shed / water columns for the first checks and adds the pill columns.

### Photos: replaced, and removed

- **Remove from display** (any rep, on the form): the photo leaves the map and the Current row, and the previous photo still on display takes its place if there is one. The file stays in Drive and the Entries row is marked `Replaced <date> by <name>`. This is for "there is a newer, better photo", not for deleting.
- **Removed** (committee only, in the sheet): for a person in shot, an inappropriate image, a plot holder asking, or a wrong plot. In `Entries` (or `Jobs`), pick a reason in `Remove photo (committee)` on that row. The photo goes to the Drive bin, the row's Photo cell says `Removed`, it leaves the Current row, and the `Removals` tab logs when, who, which row and why. The log never holds the photo itself. Then open Drive > Bin and delete it forever, or Google deletes it after 30 days.

### Committee procedure: a request to remove a photo or note

1. Anyone can ask, by any route (inbox, a rep, at the shop). The secretary owns it and replies within a week; the legal limit for a data protection request is one month.
2. A person in a photo, an inappropriate photo, or a plot holder asking for a photo of their plot to go: remove it, no discussion needed. Use the dropdown as above, then empty the Drive bin.
3. A note: clear the cell in `Entries` and in `Current` by hand. Google Sheets keeps old versions in its version history, which only the committee can see; if a request needs the text gone completely, make a copy of the sheet (File > Make a copy, which carries no history), check it, and delete the old one.
4. Tell the person it is done. Do not keep a copy of what was removed. The `Removals` row is the record that it happened.
5. Disputes between members about what a photo or note says are for the committee, not the secretary (the secretary removes on request and refers the disagreement).
6. Prevention: the form asks for no people in shot and no names in notes. A rep who sees a problem uses Remove from display at once and tells the secretary.

## Members' password (`gate.js`)

Every page opens behind one shared password. It is checked by the Apps Script, so it is never in the page, the site files or GitHub. The phone remembers it after the first time; each visit re-checks it quietly, and if the committee has changed it the password screen comes back. With no signal the page stays open, so a walk still works offline. A rep link (`?key=...`) opens the page without the password.

- **Set or change it:** the Plot checks sheet, Settings tab, next to "Members password". Capitals and spaces are ignored. While it is blank only rep links get in.
- **What members see:** the map and jobs. Plot condition only if "Members see plot condition" is Yes, and then only how it looks and the shed, greenhouse, polytunnel and water answers - never notes, flags, photos or who checked.
- **Guessing:** after 30 wrong passwords in 15 minutes the password is refused for 15 minutes. Rep links keep working.
- **Linking from the Google Site:** a button that opens the planner in a new tab. Not an embed: iPhones do not let an embedded page remember the password.
- **Order when deploying:** the Apps Script first (new version, run setup, type the password), then the site. The other way round locks everyone out.
- **Not covered:** the static files (`data/*.js`) are still readable by anyone who goes looking. They hold no plot holder details, but `plots.js` names the reps and `dashboard.js` has per-site counts.

## Next: the rep's private list

The dashboard says "4 plots without an email". The rep needs to know which four. That list is about identifiable people, so it never goes in this repo or on the open page. Plan: the receiver (Apps Script) gets a `?action=todo&token=...` read that looks up the token in a small "Rep links" tab (token, rep, site), reads the committee record sheet, and returns that site's plot numbers with their gaps. Each rep gets one link with their token; it opens on their phone with no login and shows only their site; changing the token revokes it. The data stays in Google and is read at the moment of asking, never stored on Netlify or GitHub. Needs the record in Google Sheets first (the committee workbook) and the receiver deployed.

## Deploy

Hosted on Netlify (free tier). From this folder:

```
netlify deploy --prod --dir .
```

When this folder is linked to a GitHub repo in the Netlify dashboard, a push to the main branch deploys on its own.
