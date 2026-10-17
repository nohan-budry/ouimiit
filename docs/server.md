# Server Documentation

This document provides a description of the server and the API specifications for the `ouimiit` application.

## Overview

The server is built with Node.js and Express. It serves as a backend to manage polls, allowing users to submit their availability for specific dates. Poll data is stored in the SQLite database at `data/ouimiit.sqlite`.

### Running the Server

To start the server, run:
```bash
npm start
```
The server will be available at `http://localhost:3000`.

## API Specifications

### Get Poll Data

Returns the data for a specific poll.

- **URL**: `/api/poll`
- **Method**: `GET`
- **Query Parameters**:
  - `id` (string, required): The unique identifier of the poll.
- **Success Response**:
  - **Code**: 200 OK
  - **Content**: A JSON object representing the poll.
- **Error Responses**:
  - **Code**: 400 Bad Request (Missing or invalid ID)
  - **Code**: 404 Not Found (Poll not found)

### Update Poll Response

Updates or adds a user's availability for one or multiple dates in a poll.

- **URL**: `/api/poll`
- **Method**: `PATCH`
- **Query Parameters**:
  - `id` (string, required): The unique identifier of the poll.
- **Data Params**:
  ```json
  {
    "user": "string",
    "updates": [
      { "date": "string", "available": "boolean" }
    ]
  }
  ```
- **Success Response**:
  - **Code**: 200 OK
  - **Content**: A JSON object representing the updated poll.
- **Error Responses**:
- **Code**: 400 Bad Request (Missing or invalid user, invalid updates format, invalid update item, date not in poll, or invalid ID)
  - **Code**: 404 Not Found (Poll not found)

### Create Poll

Creates a new poll with a configuration of users and dates.

- **URL**: `/api/poll`
- **Method**: `POST`
- **Data Params**:
  ```json
  {
    "id": "string",
    "users": ["string"],
    "dates": ["string"],
    "minPeople": "number (optional)"
  }
  ```
- **Success Response**:
  - **Code**: 200 OK
  - **Content**: A JSON object representing the newly created poll, including the ID.
- **Error Responses**:
  - **Code**: 400 Bad Request (Invalid ID, poll already exists, missing users, or missing dates)

## Storage

The SQLite database is stored at `data/ouimiit.sqlite`. Numbered schema migrations live in `src/server/db/migrations/` and are applied when the server starts.

Polls use the `POLLS`, `POLL_PARTICIPANTS`, `POLL_DATES`, and `POLL_RESPONSES` tables. A missing row in `POLL_RESPONSES` means that participant has not answered for that date; `AVAILABLE` stores an explicit yes or no.

The database is excluded from Git and Docker build contexts. Mount `data/` as a persistent volume when deploying with Docker. Existing JSON poll files are not imported automatically.
