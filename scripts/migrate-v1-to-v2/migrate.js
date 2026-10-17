const fs = require('node:fs');
const path = require('node:path');
const { openDatabase } = require('../../src/server/db/database');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_DATA_DIR = path.join(PROJECT_ROOT, 'data');
const POLL_ID_PATTERN = /^[a-z0-9_-]+$/i;

const isValidDate = (date) => {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};

const parseV1Poll = (pollId, value) => {
    if (!POLL_ID_PATTERN.test(pollId)) throw new Error('filename is not a valid poll ID');
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('poll must be a JSON object');
    }

    const config = value.config;
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        throw new Error('config must be an object');
    }
    if (!Array.isArray(config.users) || config.users.length === 0) {
        throw new Error('config.users must be a non-empty array');
    }
    if (config.users.some((user) => typeof user !== 'string' || !user.trim())) {
        throw new Error('every participant must be a non-empty string');
    }
    if (new Set(config.users).size !== config.users.length) {
        throw new Error('participant names must be unique');
    }
    if (!Array.isArray(config.dates) || config.dates.length === 0) {
        throw new Error('config.dates must be a non-empty array');
    }
    if (!config.dates.every(isValidDate)) {
        throw new Error('every date must be a valid YYYY-MM-DD date');
    }
    if (new Set(config.dates).size !== config.dates.length) {
        throw new Error('dates must be unique');
    }

    const rawMinPeople = config.minPeople;
    const minPeopleIsEmpty = rawMinPeople == null ||
        (typeof rawMinPeople === 'string' && rawMinPeople.trim() === '');
    const minPeople = minPeopleIsEmpty ? 0 : Number(rawMinPeople);
    if (
        (!minPeopleIsEmpty && typeof rawMinPeople !== 'number' && typeof rawMinPeople !== 'string') ||
        !Number.isInteger(minPeople) ||
        minPeople < 0
    ) {
        throw new Error('config.minPeople must be a non-negative integer');
    }

    const responses = value.responses;
    if (!responses || typeof responses !== 'object' || Array.isArray(responses)) {
        throw new Error('responses must be an object');
    }
    for (const [user, dateResponses] of Object.entries(responses)) {
        if (!config.users.includes(user)) {
            throw new Error(`response references unknown participant: ${user}`);
        }
        if (!dateResponses || typeof dateResponses !== 'object' || Array.isArray(dateResponses)) {
            throw new Error(`responses for ${user} must be an object`);
        }
        for (const [date, available] of Object.entries(dateResponses)) {
            if (!config.dates.includes(date)) {
                throw new Error(`response references unknown date for ${user}: ${date}`);
            }
            if (typeof available !== 'boolean') {
                throw new Error(`availability for ${user} on ${date} must be boolean`);
            }
        }
    }

    return {
        config: { users: config.users, dates: config.dates, minPeople },
        responses
    };
};

const readV1Polls = (dataDir = DEFAULT_DATA_DIR) => {
    if (!fs.existsSync(dataDir)) return { polls: [], errors: [] };

    const files = fs.readdirSync(dataDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => entry.name)
        .sort();
    const polls = [];
    const errors = [];

    for (const file of files) {
        const pollId = file.slice(0, -'.json'.length);
        try {
            const value = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
            polls.push({ pollId, poll: parseV1Poll(pollId, value), file });
        } catch (error) {
            errors.push({ file, message: error.message });
        }
    }

    return { polls, errors };
};

// Import logic and SQL intentionally live in this one-time migration tool,
// rather than in the database API used by the running server.
const importPoll = (pollDatabase, pollId, poll) => {
    const database = pollDatabase.database;
    const insertPoll = database.prepare(`
        INSERT INTO POLLS (ID, MIN_PEOPLE)
        VALUES (?, ?)
        ON CONFLICT (ID) DO NOTHING
    `);
    const insertParticipant = database.prepare(`
        INSERT INTO POLL_PARTICIPANTS (POLL_ID, NAME, POSITION)
        VALUES (?, ?, ?)
    `);
    const insertDate = database.prepare(`
        INSERT INTO POLL_DATES (POLL_ID, POLL_DATE, POSITION)
        VALUES (?, ?, ?)
    `);
    const insertResponse = database.prepare(`
        INSERT INTO POLL_RESPONSES (
            POLL_ID, PARTICIPANT_NAME, POLL_DATE, AVAILABLE
        )
        VALUES (?, ?, ?, ?)
    `);

    database.exec('BEGIN IMMEDIATE');
    try {
        const result = insertPoll.run(pollId, poll.config.minPeople);
        if (result.changes === 0) {
            database.exec('COMMIT');
            return false;
        }

        poll.config.users.forEach((user, position) => {
            insertParticipant.run(pollId, user, position);
        });
        poll.config.dates.forEach((date, position) => {
            insertDate.run(pollId, date, position);
        });
        for (const [user, dateResponses] of Object.entries(poll.responses)) {
            for (const [date, available] of Object.entries(dateResponses)) {
                insertResponse.run(pollId, user, date, available ? 1 : 0);
            }
        }

        database.exec('COMMIT');
        return true;
    } catch (error) {
        try {
            database.exec('ROLLBACK');
        } catch {
            // Preserve the import error if SQLite already ended the transaction.
        }
        throw error;
    }
};

const runMigration = ({
    dataDir = DEFAULT_DATA_DIR,
    databasePath,
    dryRun = false,
    log = console
} = {}) => {
    const { polls, errors } = readV1Polls(dataDir);

    for (const error of errors) log.error(`Invalid ${error.file}: ${error.message}`);
    if (errors.length > 0) {
        log.error('No polls imported. Fix the invalid files and run the migration again.');
        return { imported: 0, skipped: 0, errors: errors.length };
    }
    if (polls.length === 0) {
        log.log(`No v1 JSON poll files found in ${dataDir}.`);
        return { imported: 0, skipped: 0, errors: 0 };
    }
    if (dryRun) {
        log.log(`Validated ${polls.length} v1 poll file(s).`);
        log.log('Dry run only: the database was not opened or changed. Existing poll IDs were not checked.');
        return { imported: 0, skipped: 0, errors: 0, validated: polls.length };
    }

    const database = databasePath ? openDatabase(databasePath) : openDatabase();
    let imported = 0;
    let skipped = 0;
    let importErrors = 0;
    try {
        for (const { pollId, poll, file } of polls) {
            try {
                if (importPoll(database, pollId, poll)) {
                    imported++;
                    log.log(`Imported ${file}.`);
                } else {
                    skipped++;
                    log.log(`Skipped ${file}: poll ID already exists in SQLite.`);
                }
            } catch (error) {
                importErrors++;
                log.error(`Failed to import ${file}: ${error.message}`);
            }
        }
    } finally {
        database.close();
    }

    log.log(`Migration complete: ${imported} imported, ${skipped} skipped, ${importErrors} failed.`);
    return { imported, skipped, errors: importErrors };
};

const main = () => {
    const args = process.argv.slice(2);
    const unknownArgs = args.filter((arg) => arg !== '--dry-run');
    if (unknownArgs.length > 0 || args.filter((arg) => arg === '--dry-run').length > 1) {
        console.error('Usage: npm run migrate:v1-to-v2 [-- --dry-run]');
        process.exitCode = 2;
        return;
    }

    const result = runMigration({ dryRun: args.includes('--dry-run') });
    if (result.errors > 0) process.exitCode = 1;
};

if (require.main === module) main();

module.exports = { importPoll, parseV1Poll, readV1Polls, runMigration };
