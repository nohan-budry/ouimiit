# Server Documentation

This document provides a description of the server and the API specifications for the `ouimiit` application.

## Overview

The server is built with Node.js and Express. It serves as a backend to manage polls, allowing users to submit their availability for specific dates. Poll data is stored as JSON files in the `data/` directory.

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

Updates or adds a user's availability for a specific date in a poll.

- **URL**: `/api/poll`
- **Method**: `POST`
- **Query Parameters**:
  - `id` (string, required): The unique identifier of the poll.
- **Data Params**:
  ```json
  {
    "user": "string",
    "date": "string",
    "available": "boolean"
  }
  ```
- **Success Response**:
  - **Code**: 200 OK
- **Error Responses**:
  - **Code**: 400 Bad Request (Missing user, invalid date or availability, or invalid ID)
  - **Code**: 404 Not Found (Poll not found)

## Storage

Polls are stored in the `data/` directory as `<pollId>.json`.
The structure of a poll file is typically:
```json
{
  "responses": {
    "username": {
      "YYYY-MM-DD": true
    }
  }
}
```
