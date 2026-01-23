# Ouimiit

Simple RSVP/availability planner for a small group. The UI lets users pick
availability per date, saves responses to `data/data.json`, and shows a
summary table.

“Ouimiit” is meant to be read with a French accent — it roughly sounds like “We meet.”

## Configuration

Edit `config.js`:

- `users`: array of user names shown in the UI.
- `dates`: array of date strings in `YYYY-MM-DD` format.
- `minPeople`: minimum number of available people required to highlight a day.

Example:

```js
module.exports = {
  users: ["Adrien", "Basile"],
  minPeople: 2,
  dates: ["2026-02-02", "2026-02-03"]
};
```

## Install

```bash
npm install
```

## Run (dev)

Dev mode watches `server.js` and hot-reloads the browser when `public/` or
`config.js` changes.

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

With volumes for persistent data and custom config:

```bash
docker run --rm -p 3000:3000 \
  -v "$(pwd)/data:/app/data" \
  -v "$(pwd)/config.js:/app/config.js:ro" \
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
      - ./config.js:/app/config.js:ro
```
