Angular setup (quick)

1. Install Node LTS and Angular CLI.
2. Generate a project: `ng new rescue-ready --routing --style=scss`.
3. Copy `src/` and `src/assets/` from this repository into the generated project.
4. Install any extra deps (e.g., `npm install ngx-toastr` for notifications).
5. Run with `ng serve` and open `http://localhost:4200`.

Notes
- Place `vehicles.json` under `src/assets/data/vehicles.json` so it is served as a static asset.
