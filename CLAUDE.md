# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A minimal blog/updates app built with Flask and SQLAlchemy, using SQLite for storage. Posts have a title, content, and timestamp. The app was originally scaffolded as a Django project but has been rewritten as a single-file Flask app.

## Running the App

```bash
pip install flask flask-sqlalchemy humanize
python app.py
```

The app runs on port 8080 with debug mode enabled.

## Architecture

- **`app.py`** — Entire backend: Flask app, SQLAlchemy model (`Post`), all routes, and Jinja template filters (`fmt_date`, `relative`)
- **`templates/`** — Jinja2 templates: `index.html` (post list), `view.html` (single post), `new.html` (create form)
- **`instance/blog.db`** — SQLite database (gitignored)
- **`vercel.json`** — Routes all requests to `api/wsgi.py` (leftover from prior Django setup; not currently functional)
- **`admin.html`** — Empty; `/admin` route returns nothing

## Key Details

- All datetimes are stored as UTC and converted to `America/Chicago` for display
- The `humanize` library is used for relative timestamps ("3 hours ago")
- No authentication or authorization on any route, including `/submit` and `/admin`
- Database is auto-created by SQLAlchemy on first run
- Styles are inlined in each template (no shared CSS file)
