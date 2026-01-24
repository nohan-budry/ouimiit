# Ouimiit

Simple RSVP/availability planner for a small group. The UI lets users pick
availability per date, saves responses to `data/data.json`, and shows a
summary table.

“Ouimiit” is meant to be read with a French accent — it roughly sounds like “We meet.”

## Configuration

Each poll is stored in `data/<id>.json`. The config lives alongside responses:

```json
{
  "config": {
    "users": ["Adrien", "Basile"],
    "minPeople": 2,
    "dates": ["2026-02-02", "2026-02-03"]
  },
  "responses": {}
}
```

## Multiple polls

Pass a query param `id` to select a poll:

- `http://localhost:3000` shows the join form
- `http://localhost:3000/?id=team-a` uses `data/team-a.json`

## Install

```bash
npm install
```

## Run (dev)

Dev mode watches `server.js` for server restarts.

```bash
npm run dev
```

## Run (prod)

```bash
npm start
```

Server listens on `http://localhost:3000`.

## Docker

The Docker image uses `node:18-alpine`, installs dependencies, and runs
`server.js` on port 3000.

Build and run:

```bash
docker build -t ghcr.io/nohan-budry/ouimiit:latest .
docker run --rm -p 3000:3000 ghcr.io/nohan-budry/ouimiit:latest
```

With a volume for persistent poll data:

```bash
docker run --rm -p 3000:3000 \
  -v "$(pwd)/data:/app/data" \
  ghcr.io/nohan-budry/ouimiit:latest
```

Docker Compose example:

```yaml
services:
  ouimiit:
    image: ghcr.io/nohan-budry/ouimiit:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
```
