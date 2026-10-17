const fs = require('fs');
const path = require('path');
const BetterSqlite3 = require('better-sqlite3');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const DEFAULT_DATABASE_PATH = path.join(PROJECT_ROOT, 'data', 'ouimiit.sqlite');

class PollNotFoundError extends Error {
    constructor(pollId) {
        super(`Poll not found: ${pollId}`);
        this.name = 'PollNotFoundError';
        this.pollId = pollId;
    }
}

class ParticipantNotFoundError extends Error {
    constructor(name) {
        super(`Participant not found: ${name}`);
        this.name = 'ParticipantNotFoundError';
        this.participantName = name;
    }
}

class PollDateNotFoundError extends Error {
    constructor(date) {
        super(`Date not found in poll: ${date}`);
        this.name = 'PollDateNotFoundError';
        this.pollDate = date;
    }
}

const applyMigrations = (database) => {
    database.exec(`
        CREATE TABLE IF NOT EXISTS DB_MIGRATIONS (
            VERSION TEXT PRIMARY KEY NOT NULL,
            APPLIED_AT TEXT NOT NULL DEFAULT (
                STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'NOW')
            )
        )
    `);

    const getAppliedMigration = database.prepare(
        'SELECT VERSION FROM DB_MIGRATIONS WHERE VERSION = ?'
    );
    const recordMigration = database.prepare(
        'INSERT INTO DB_MIGRATIONS (VERSION) VALUES (?)'
    );

    const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
        .filter((file) => /^\d+.*\.sql$/.test(file))
        .sort();

    for (const file of migrationFiles) {
        if (getAppliedMigration.get(file)) continue;

        const migration = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        database.transaction(() => {
            database.exec(migration);
            recordMigration.run(file);
        })();
    }
};

class PollDatabase {
    constructor(database) {
        this.database = database;
        this.statements = {
            getPoll: database.prepare(`
                SELECT ID, MIN_PEOPLE
                FROM POLLS
                WHERE ID = ?
            `),
            getParticipants: database.prepare(`
                SELECT NAME
                FROM POLL_PARTICIPANTS
                WHERE POLL_ID = ?
                ORDER BY POSITION
            `),
            getDates: database.prepare(`
                SELECT POLL_DATE
                FROM POLL_DATES
                WHERE POLL_ID = ?
                ORDER BY POSITION
            `),
            getResponses: database.prepare(`
                SELECT PARTICIPANT_NAME, POLL_DATE, AVAILABLE
                FROM POLL_RESPONSES
                WHERE POLL_ID = ?
            `),
            hasParticipant: database.prepare(`
                SELECT 1
                FROM POLL_PARTICIPANTS
                WHERE POLL_ID = ? AND NAME = ?
            `),
            hasDate: database.prepare(`
                SELECT 1
                FROM POLL_DATES
                WHERE POLL_ID = ? AND POLL_DATE = ?
            `),
            insertPoll: database.prepare(`
                INSERT INTO POLLS (ID, MIN_PEOPLE)
                VALUES (?, ?)
                ON CONFLICT (ID) DO NOTHING
            `),
            insertParticipant: database.prepare(`
                INSERT INTO POLL_PARTICIPANTS (POLL_ID, NAME, POSITION)
                VALUES (?, ?, ?)
            `),
            insertDate: database.prepare(`
                INSERT INTO POLL_DATES (POLL_ID, POLL_DATE, POSITION)
                VALUES (?, ?, ?)
            `),
            upsertResponse: database.prepare(`
                INSERT INTO POLL_RESPONSES (
                    POLL_ID, PARTICIPANT_NAME, POLL_DATE, AVAILABLE
                )
                VALUES (?, ?, ?, ?)
                ON CONFLICT (POLL_ID, PARTICIPANT_NAME, POLL_DATE)
                DO UPDATE SET AVAILABLE = EXCLUDED.AVAILABLE
            `)
        };

        this.insertPollTransaction = database.transaction((pollId, config) => {
            const result = this.statements.insertPoll.run(
                pollId,
                Number(config.minPeople) || 0
            );
            if (result.changes === 0) return false;

            config.users.forEach((name, position) => {
                this.statements.insertParticipant.run(pollId, name, position);
            });
            config.dates.forEach((date, position) => {
                this.statements.insertDate.run(pollId, date, position);
            });

            return true;
        });

        this.updateResponsesTransaction = database.transaction((pollId, user, updates) => {
            if (!this.statements.getPoll.get(pollId)) {
                throw new PollNotFoundError(pollId);
            }
            if (!this.statements.hasParticipant.get(pollId, user)) {
                throw new ParticipantNotFoundError(user);
            }

            // Validate every date before writing any updates.
            for (const update of updates) {
                if (!this.statements.hasDate.get(pollId, update.date)) {
                    throw new PollDateNotFoundError(update.date);
                }
            }

            for (const update of updates) {
                this.statements.upsertResponse.run(
                    pollId,
                    user,
                    update.date,
                    update.available ? 1 : 0
                );
            }
        });
    }

    getPoll(pollId) {
        const pollRow = this.statements.getPoll.get(pollId);
        if (!pollRow) return null;

        const users = this.statements.getParticipants.all(pollId)
            .map((row) => row.NAME);
        const dates = this.statements.getDates.all(pollId)
            .map((row) => row.POLL_DATE);
        const responses = Object.create(null);

        for (const row of this.statements.getResponses.all(pollId)) {
            if (!Object.hasOwn(responses, row.PARTICIPANT_NAME)) {
                responses[row.PARTICIPANT_NAME] = Object.create(null);
            }
            responses[row.PARTICIPANT_NAME][row.POLL_DATE] = Boolean(row.AVAILABLE);
        }

        return {
            config: {
                users,
                dates,
                minPeople: pollRow.MIN_PEOPLE
            },
            responses
        };
    }

    createPoll(pollId, config) {
        return this.insertPollTransaction(pollId, config);
    }

    updateResponses(pollId, user, updates) {
        this.updateResponsesTransaction(pollId, user, updates);
        return this.getPoll(pollId);
    }

    close() {
        this.database.close();
    }
}

const openDatabase = (databasePath = process.env.OUIMIIT_DB_PATH || DEFAULT_DATABASE_PATH) => {
    const resolvedPath = path.resolve(databasePath);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

    const database = new BetterSqlite3(resolvedPath);
    try {
        database.pragma('foreign_keys = ON');
        database.pragma('busy_timeout = 5000');
        database.pragma('journal_mode = WAL');
        applyMigrations(database);
        return new PollDatabase(database);
    } catch (error) {
        database.close();
        throw error;
    }
};

module.exports = {
    openDatabase,
    PollNotFoundError,
    ParticipantNotFoundError,
    PollDateNotFoundError
};
