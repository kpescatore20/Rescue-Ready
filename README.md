Rescue Ready — First Responder Crash-Test Lookup

Purpose
- Fast lookup of vehicle crash-test details and rescue-relevant data for first responders.

Scope
- Angular front-end that queries a local dataset (and later external APIs) to show crash-test ratings, rescue sheets, battery locations, and extrication notes.

Getting started (recommended)
1. Install Node.js (LTS) and Angular CLI:

```bash
npm install -g @angular/cli
```

2. Create and run the Angular app (from this repository root):

```bash
ng new rescue-ready --routing --style=scss
cd rescue-ready
# copy src and assets from this repo into the generated project
npm install
ng serve
```

Files added here are starter templates and a sample dataset. See `docs/angular-setup.md` for detailed steps.

Data model (sample fields)
- `id`, `make`, `model`, `year`, `crashTestRating`, `doorCount`, `fuelType`, `highVoltageBattery` (bool), `batteryLocation`, `extricationNotes`, `rescueSheetLink`, `images`.

Next steps
- Implement search UI and fast filters for `batteryLocation`, `roofStrength`, `rescueSheetLink`.
- Add offline support and packaged rescue sheet print/export.
