# OUIMIIT - Availability Planner

OUIMIIT is a simple, trust-based availability planner designed to help groups coordinate dates without the overhead of account management or complex features.

## Core Principles

- **Simplicity**: No account creation, no passwords, no unnecessary features.
- **Trust-based**: Anyone with the poll ID can view and edit responses. It relies on the group's mutual trust.
- **Privacy**: Poll IDs are the only "keys" to access data.

## How it Works

1. **Poll Structure**: Each poll consists of:
   - A list of **persons** (participants).
   - A list of **dates** to be considered.
   - A **minimum number of people** target (optional, for visual highlighting).
2. **Participation**:
   - Users identify themselves by selecting their name from the list.
   - They toggle their availability (Available/Unavailable) for each proposed date.
3. **Visualization**:
   - An overview table shows everyone's responses at a glance.
   - Dates meeting the minimum required attendance are highlighted.

## Technical Stack

- **Frontend**: Single-page application built with [Alpine.js](https://alpinejs.dev/) and styled with [Tailwind CSS](https://tailwindcss.com/).
- **Backend**: [Node.js/Express server](server.md) managing data persistence.
- **Storage**: JSON-based file storage.

For more details on the API and server implementation, see the [Server Documentation](server.md).