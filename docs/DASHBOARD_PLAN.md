# Plan: WorkShot Dashboard — FastAPI + Bootstrap + SQLite

## Context

WorkShot R1 is complete (v1.0.0 tagged, CI green). The CLI works but requires terminal usage for every operation. The operator wants a local web dashboard to manage jobs visually — browse jobs in a table, validate/run with one click, preview outputs (images, captions, manifest), and track job history. The CLI contract is frozen and unchanged; the dashboard is a thin web layer that calls the existing CLI as a subprocess.

The operator specified: FastAPI + Bootstrap, a database for jobs, and table format display.

## Architecture

```
Work-Shot/
├── src/          (existing Node.js CLI — UNCHANGED)
├── tests/        (existing tests — UNCHANGED)
├── web/          (NEW — Python dashboard)
│   ├── app.py              # FastAPI application + routes
│   ├── models.py           # SQLAlchemy models (SQLite)
│   ├── database.py         # DB engine + session factory
│   ├── cli_runner.py       # Subprocess wrapper for Node.js CLI
│   ├── path_safety.py      # Path validation for API inputs
│   ├── templates/
│   │   └── index.html      # Single-page dashboard (Jinja2 + Bootstrap)
│   ├── static/
│   │   ├── app.js          # Dashboard JS (fetch API calls, DOM updates)
│   │   └── app.css         # Custom styles
│   └── requirements.txt    # Python dependencies
├── workshot.db             # SQLite database (gitignored, project root)
├── package.json            # existing (unchanged)
└── ...
```

**Execution model:** FastAPI runs `node dist/index.js validate <job_dir>` and `node dist/index.js run <job_dir> --layout <layout>` as subprocesses. The dashboard never imports or calls Node.js code directly.

## SQLite Schema

```sql
CREATE TABLE jobs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    job_dir     TEXT NOT NULL UNIQUE,     -- absolute path to job directory
    job_id      TEXT,                      -- from job.json jobId field
    service     TEXT,                      -- from job.json work.service
    notes       TEXT,                      -- from job.json work.notes
    status      TEXT NOT NULL DEFAULT 'pending',  -- pending|validated|processed|error
    layout      TEXT DEFAULT 'side-by-side',      -- last layout used
    error_msg   TEXT,                      -- last error message (if any)
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    run_at      DATETIME                   -- last successful run timestamp
);
```

**Status lifecycle:** `pending` → `validated` → `processed` (or `error` at any step)

When a job is added, the dashboard reads `job.json` to populate `job_id`, `service`, `notes`. These are cached in the DB for fast table rendering without filesystem reads.

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET /` | Serve dashboard HTML | |
| `GET /api/health` | Health check | Returns `{ "status": "ok", "cli_available": bool }` |
| `GET /api/jobs` | List all jobs | Returns job table data from DB |
| `POST /api/jobs` | Add a job directory | Reads job.json, creates DB record |
| `POST /api/jobs/{id}/validate` | Run validation | Subprocess: `validate <job_dir>` |
| `POST /api/jobs/{id}/run` | Run pipeline | Subprocess: `run <job_dir> --layout <layout>` |
| `GET /api/jobs/{id}` | Job detail | DB record + manifest data if processed |
| `GET /api/jobs/{id}/files/{filename}` | Serve job files | Images, caption, manifest from job dir |
| `DELETE /api/jobs/{id}` | Remove from DB | Does NOT delete files on disk |
| `POST /api/jobs/scan` | Scan jobs/ directory | Auto-discover job folders and add to DB |

### File serving security
`GET /api/jobs/{id}/files/{filename}` only serves files from the job's directory or its `output/` subdirectory. Allowed filenames are validated against a whitelist pattern (image extensions, `job.json`, `caption.generic.txt`, `manifest.json`). No path traversal allowed.

## UI Design — Single Page Dashboard

### Layout (Bootstrap 5 grid)

```
┌─────────────────────────────────────────────────────────┐
│  WorkShot Dashboard                    [API ● Online]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [Add Job Directory: _______________] [Add] [Scan Jobs] │
│                                                         │
│  ┌─────────────────────────────────────────────────────┐│
│  │ Job Table                                           ││
│  │ ┌────────┬─────────┬────────┬────────┬───────────┐ ││
│  │ │ Job ID │ Service │ Status │ Layout │  Actions   │ ││
│  │ ├────────┼─────────┼────────┼────────┼───────────┤ ││
│  │ │ _exam  │ tree    │ ● proc │ side   │ [▶][✓][👁]│ ││
│  │ │ job-2  │ tree    │ ● pend │ stack  │ [▶][✓][👁]│ ││
│  │ │ job-3  │ stump   │ ● err  │ side   │ [▶][✓][👁]│ ││
│  │ └────────┴─────────┴────────┴────────┴───────────┘ ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  ┌─────────────────────────────────────────────────────┐│
│  │ Job Detail Panel (shown when a row is clicked)      ││
│  │                                                     ││
│  │ ┌──────────┐ ┌──────────┐ ┌──────────────────────┐ ││
│  │ │  BEFORE   │ │  AFTER   │ │     COMPOSITE        │ ││
│  │ │  (image)  │ │  (image) │ │     (output image)   │ ││
│  │ └──────────┘ └──────────┘ └──────────────────────┘ ││
│  │                                                     ││
│  │ ┌──────────────────┐ ┌────────────────────────────┐ ││
│  │ │ Caption          │ │ Manifest (JSON)            │ ││
│  │ │ "Before & after  │ │ { schemaVersion: "1.0",   │ ││
│  │ │  from today's..."│ │   jobId: "...", ...}       │ ││
│  │ │         [Copy 📋]│ │                            │ ││
│  │ └──────────────────┘ └────────────────────────────┘ ││
│  │                                                     ││
│  │ Layout: [side-by-side ▾]  [Validate] [Run Pipeline] ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### Key UI behaviors
- **Job table** is the primary view — always visible
- **Status badges**: green (processed), yellow (validated), gray (pending), red (error)
- **Action buttons** per row: Run (▶), Validate (✓), View Detail (👁)
- **Detail panel** expands below the table when a job is selected
- **Before/After/Composite** images displayed side by side in the detail panel
- **Caption** shown with a copy-to-clipboard button
- **Manifest** shown as formatted JSON in a collapsible code block
- **Layout selector** dropdown in the detail panel — changes layout for next run
- **Auto-scan on startup**: dashboard scans `jobs/` on first load and pre-populates DB
- **Scan Jobs** button: re-scans `jobs/` directory to discover new job folders
- **Spinner** shown during validate/run operations
- **Error messages** displayed in red alert boxes
- **Mobile**: panels stack vertically, table scrolls horizontally

### Bootstrap components used
- `container-fluid`, `row`, `col-lg-*` for grid
- `table table-striped table-hover` for job table
- `card` for detail panel sections
- `badge` for status indicators
- `btn-primary` for Run, `btn-outline-secondary` for Validate
- `alert alert-danger` for errors, `alert alert-warning` for warnings
- `spinner-border` during async operations
- `modal` or collapsible panel for detail view
- `font-monospace` for JSON/log display

## Implementation Sequence

### Step 1: Python scaffold + health endpoint
- Create `web/` directory structure
- `web/requirements.txt`: fastapi, uvicorn, sqlalchemy, jinja2, python-multipart
- `web/database.py`: SQLAlchemy engine + session for `workshot.db`
- `web/models.py`: Job model matching schema above
- `web/app.py`: FastAPI app with `GET /api/health` (checks `node dist/index.js` is available)
- App startup event: auto-scan `jobs/` directory, upsert discovered jobs into DB
- Add `workshot.db`, `__pycache__/`, `*.pyc` to `.gitignore`
- Verify: `uvicorn web.app:app --reload` starts, health endpoint returns OK

### Step 2: CLI subprocess runner
- `web/cli_runner.py`: async subprocess wrapper
  - `run_validate(job_dir)` → `{ success, stdout, stderr, exit_code }`
  - `run_pipeline(job_dir, layout)` → `{ success, stdout, stderr, exit_code }`
  - Timeout enforcement (30s default)
  - Parses stderr for error messages
  - Uses `asyncio.create_subprocess_exec`

### Step 3: Job CRUD API
- `POST /api/jobs` — validate path exists, read job.json, create DB record
- `GET /api/jobs` — return all jobs as JSON array
- `GET /api/jobs/{id}` — return single job + manifest data if available
- `DELETE /api/jobs/{id}` — soft delete from DB
- `POST /api/jobs/scan` — scan `jobs/` for folders with job.json, upsert into DB
- `web/path_safety.py`: validate job_dir is real directory, contains job.json

### Step 4: Validate + Run API
- `POST /api/jobs/{id}/validate` — call CLI validate, update DB status
- `POST /api/jobs/{id}/run` — call CLI run, update DB status + run_at
- `GET /api/jobs/{id}/files/{filename}` — serve files from job dir with whitelist

### Step 5: Bootstrap dashboard UI
- `web/templates/index.html` — Jinja2 base template with Bootstrap 5 CDN
- `web/static/app.js` — fetch-based API client, DOM manipulation
  - Job table rendering from `/api/jobs`
  - Add job form submission
  - Validate/Run button handlers with spinner
  - Detail panel population (images, caption, manifest)
  - Auto-refresh table after operations
- `web/static/app.css` — minimal custom styles (image sizing, panel transitions)

### Step 6: Polish + documentation
- Error handling throughout (network errors, CLI failures, missing files)
- Loading states (spinners during operations)
- Update `README.md` with dashboard run instructions
- Smoke test: validate + run `jobs/_example` from dashboard

## Security Considerations

1. **Path validation**: All job_dir inputs validated — must be existing directory containing job.json. No arbitrary filesystem access.
2. **File serving whitelist**: Only serve files matching known patterns (`.png`, `.jpg`, `.jpeg`, `job.json`, `caption.generic.txt`, `manifest.json`) from validated job directories.
3. **Subprocess safety**: job_dir passed as argument to subprocess (not shell-interpolated). Use `subprocess.run([...], shell=False)`.
4. **Local-only**: Dashboard binds to `127.0.0.1` by default. Not exposed to network.
5. **No file mutation**: Dashboard never writes to job directories. Only the CLI subprocess writes to `output/`.

## Files Modified

| File | Change |
|------|--------|
| `web/app.py` | NEW — FastAPI application |
| `web/models.py` | NEW — SQLAlchemy models |
| `web/database.py` | NEW — DB engine/session |
| `web/cli_runner.py` | NEW — CLI subprocess wrapper |
| `web/path_safety.py` | NEW — Path validation |
| `web/templates/index.html` | NEW — Dashboard HTML |
| `web/static/app.js` | NEW — Dashboard JavaScript |
| `web/static/app.css` | NEW — Dashboard styles |
| `web/requirements.txt` | NEW — Python dependencies |
| `.gitignore` | EDIT — add `workshot.db`, `__pycache__/`, `*.pyc` |

**No existing source files are modified.** The R1 CLI contract is untouched.

## Verification

1. `pip install -r web/requirements.txt`
2. `npm run build` (ensure CLI is built)
3. `uvicorn web.app:app --reload`
4. Open `http://localhost:8000`
5. Click "Scan Jobs" — `_example` job appears in table
6. Click Validate on `_example` — status changes to "validated"
7. Click Run on `_example` — status changes to "processed"
8. Click View — detail panel shows before/after/composite images, caption, manifest
9. Copy caption — clipboard works
10. Add a new job directory manually — appears in table
