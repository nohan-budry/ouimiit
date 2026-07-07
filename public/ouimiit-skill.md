# Ouimiit — AI Skill

You can manage Ouimiit polls on behalf of the user.
The base URL is the same origin as this file (e.g. `https://your-ouimiit-server.com`).

---

## Create a poll

```
POST {base_url}/api/poll
Content-Type: application/json

{
  "id": "MY-POLL-ID",
  "users": ["Alice", "Bob", "Charlie"],
  "dates": ["2026-02-02", "2026-02-03"],
  "minPeople": 2
}
```

- `id` — unique identifier for the poll. Can be any lowercase/uppercase alphanumeric string with dashes or underscores (e.g. `team-july`). The UI generates random IDs of **16 characters using uppercase letters and digits** (e.g. `A3FX92KLQ8RT1BNZ`). You may generate one in the same format or let the user choose a readable name.
- `users` — list of participant names (required, at least one).
- `dates` — list of dates in `YYYY-MM-DD` format (required, at least one).
- `minPeople` — optional minimum number of people needed for a date to be considered valid. Defaults to `0` (no minimum).

A successful POST returns the created poll object including `id`, `config`, and `responses`.

---

## Set availabilities

### Step 1 — Fetch the poll

```
GET {base_url}/api/poll?id={poll_id}
```

This returns the poll data. Extract:
- `config.dates` — list of all dates in the poll (e.g. `["2026-02-02", "2026-02-03"]`)
- `config.users` — list of participant names (use this to confirm the user's exact name)

### Step 2 — Check the user's calendar

For each date in `config.dates`, check the user's calendar to determine whether they are available (`true`) or not (`false`).

### Step 3 — Submit all availabilities in a single call

```
PATCH {base_url}/api/poll?id={poll_id}
Content-Type: application/json

{
  "user": "{person_name}",
  "updates": [
    { "date": "2026-02-02", "available": true },
    { "date": "2026-02-03", "available": false }
  ]
}
```

A successful PATCH returns the updated poll object.

---

## Rules

- Always do the GET before PATCH — never assume which dates exist.
- The `user` value must **exactly match** one of the names in `config.users`.
- Include **all dates** from `config.dates` in the `updates` array, even unavailable ones.
- Dates must be in `YYYY-MM-DD` format.

---

## Example

User says: *"Create a poll called `team-july` for Alice and Bob on July 10 and 11, then set my availabilities. I'm Alice."*

1. `POST /api/poll` with `id: "team-july"`, `users: ["Alice", "Bob"]`, `dates: ["2026-07-10", "2026-07-11"]`
2. Check Alice's calendar for July 10 and 11
3. `PATCH /api/poll?id=team-july` with all dates and their availability for Alice
