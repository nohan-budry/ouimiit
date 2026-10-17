# Migrate poll data from v1.0 to v2.0

This folder contains a **manual, one-time migration tool** for moving v1.0 per-poll JSON files into the v2.0 SQLite database. It is not run by the server, and its tests are separate from `npm test`.

The script reads `data/<poll-id>.json`, validates the poll and responses, and imports them into `data/ouimiit.sqlite`. It calls the server's database opener to create the database and apply schema migrations, but the import SQL and behavior are specific to this migration and remain in this folder. Each poll is imported in its own transaction. Existing poll IDs are skipped rather than overwritten, and JSON files are never modified or deleted.

## Before migrating

1. Stop the v1.0 server so the JSON files cannot change during import.
2. Back up the `data/` directory.
3. Use the same persistent `data/` directory for migration and the v2.0 server. If using `OUIMIIT_DB_PATH`, configure the v2.0 server to use that same database path.

## Run

First validate source files without opening or changing a database:

```bash
npm run migrate:v1-to-v2 -- --dry-run
```

The dry run does not check for poll IDs already in SQLite. After reviewing the output, run the import:

```bash
npm run migrate:v1-to-v2
```

The importer creates the database and applies migrations itself; there is no need to start the server first. Start the v2.0 server afterward with `npm start`, verify the polls, and keep the JSON files and backup until you are satisfied with the result.

Invalid source files prevent the import from starting. If a database error occurs while importing a poll, that poll is rolled back, other polls are still attempted, and the command exits with an error. Fix the issue and rerun; already imported IDs will be skipped.

## Data handling

- Participant and date order is preserved.
- Explicit `true` and `false` responses are preserved.
- Missing responses remain unanswered.
- Responses for unknown participants or dates are rejected.
- Invalid JSON, IDs, duplicate participants/dates, and malformed values are reported.
