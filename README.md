# Plot planner - Acton Gardening Association

Site maps for the allotments: plot numbers, paths, sheds, water and jobs, with a card per plot. Static page, no frameworks, no accounts, works on a phone.

**Demo status.** Bromyard Avenue only. Plot numbers are provisional until the site rep confirms them. The plot card shows where details would sit; it holds none.

## The rule this page follows

Nothing about plot holders lives here. The map knows plot numbers and where things are. Everything about a plot (holder, rent, checks, photos, flags, notes) stays in the committee's own record and is looked up by plot number. That keeps this page safe to publish and keeps one record, not two.

## Files

- `index.html` - the page and its styles
- `planner.js` - draws the map from the data and handles taps
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
- **A job** (tap its pin or its row) - what, where, how soon, who logged it, photo, the update history, and a form to set a new status with a note. Statuses: Logged, Needs approval at the next committee meeting, Approved - waiting to be done, Done, Not doing.
- **Log a job** - what, a line more, how soon, near which plot, pin it on the map (tap), optional photo, your name.

Jobs logged or updated on a phone are kept on that phone until the receiver is connected; then they are sent to the "Jobs" and "Job updates" tabs of the association sheet and read back, so every phone shows the same list. The three Bromyard jobs from the sketch are seeded in `data/sites.js`.

## Plot check form (`check.html`)

The rep's form, with no sign-in. The map is the menu: tap a plot, "Check this plot", answer, send, back to the map for the next one. The name is remembered on the phone after the first entry. Questions: how it looks; shed? (if yes: good condition / needs roof repair / unsafe, needs removing); polytunnel?; water harvesting? (if yes: gutters, butt connected, butt not connected, other container); anything else to flag; a photo; a line. The page shrinks the photo on the phone (longest edge 1600 px, which also strips location data), then posts one message to a small Apps Script in the association's Google account. That script files the photo in Drive as `Plot checks / <Site> / Plot <n> / <date> <who>.jpg` and appends a row to the "Plot checks" sheet, so everything is filed the moment it arrives. Nothing to move afterwards.

- Script: `apps-script/Code.gs`, with its set-up steps at the top. It needs the association account to authorise it once.
- Connect: paste the web app URL into `data/config.js` as `submitUrl` and redeploy. Until then the form shows "not connected yet" and sends nothing.
- A rep's own link pre-fills who and site: `check.html?who=Jon%20Snow&site=Bromyard`. Save it to the phone home screen.
- Plot lists per site are in `data/plots.js`, from the association's record.

Limits worth knowing: the web app URL is public, so anyone who finds it could post an entry (there is no login by design); the sheet shows who claimed to send it. Photos tied to plots are committee material: the Drive folder stays private to the committee.

## Deploy

Hosted on Netlify (free tier). From this folder:

```
netlify deploy --prod --dir .
```

When this folder is linked to a GitHub repo in the Netlify dashboard, a push to the main branch deploys on its own.
