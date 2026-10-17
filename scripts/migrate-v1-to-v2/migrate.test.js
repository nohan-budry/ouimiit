const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, describe, test } = require('node:test');

const {
    parseV1Poll,
    runMigration
} = require('./migrate');
const { openDatabase } = require('../../src/server/db/database');

describe('v1.0 to v2.0 migration', () => {
    let directory;

    before(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ouimiit-v1-to-v2-test-'));
    });

    after(() => {
        fs.rmSync(directory, { recursive: true, force: true });
    });

    test('validates a v1 poll while preserving yes, no, and unanswered states', () => {
        const poll = parseV1Poll('legacy-poll', {
            config: {
                users: ['Alice', 'Bob'],
                dates: ['2026-10-20', '2026-10-21'],
                minPeople: '2'
            },
            responses: {
                Alice: { '2026-10-20': true, '2026-10-21': false },
                Bob: {}
            }
        });

        assert.deepEqual(poll.config, {
            users: ['Alice', 'Bob'],
            dates: ['2026-10-20', '2026-10-21'],
            minPeople: 2
        });
        assert.equal(poll.responses.Alice['2026-10-20'], true);
        assert.equal(poll.responses.Alice['2026-10-21'], false);
        assert.deepEqual(poll.responses.Bob, {});
    });

    test('rejects malformed participants, dates, minimums, and responses', () => {
        const valid = {
            config: { users: ['Alice'], dates: ['2026-10-20'], minPeople: 0 },
            responses: {}
        };

        assert.throws(() => parseV1Poll('legacy-poll', {
            ...valid,
            responses: { Mallory: { '2026-10-20': true } }
        }), /unknown participant/);
        assert.throws(() => parseV1Poll('legacy-poll', {
            ...valid,
            responses: { Alice: { '2026-10-21': true } }
        }), /unknown date/);
        assert.throws(() => parseV1Poll('legacy-poll', {
            ...valid,
            config: { ...valid.config, minPeople: 'oops' }
        }), /minPeople/);
    });

    test('dry run validates source files without creating a database', () => {
        const dataDir = path.join(directory, 'dry-run-data');
        const databasePath = path.join(directory, 'dry-run.sqlite');
        fs.mkdirSync(dataDir);
        fs.writeFileSync(path.join(dataDir, 'dry-run-poll.json'), JSON.stringify({
            config: { users: ['Alice'], dates: ['2026-10-20'], minPeople: 0 },
            responses: {}
        }));
        const messages = [];
        const log = { log: (message) => messages.push(message), error: (message) => messages.push(message) };

        const result = runMigration({ dataDir, databasePath, dryRun: true, log });

        assert.deepEqual(result, { imported: 0, skipped: 0, errors: 0, validated: 1 });
        assert.equal(fs.existsSync(databasePath), false);
        assert.ok(messages.some((message) => message.includes('Dry run only')));
    });

    test('invalid source files abort before creating the database', () => {
        const dataDir = path.join(directory, 'invalid-data');
        const databasePath = path.join(directory, 'invalid.sqlite');
        fs.mkdirSync(dataDir);
        fs.writeFileSync(path.join(dataDir, 'broken.json'), '{invalid');
        const messages = [];
        const log = { log: (message) => messages.push(message), error: (message) => messages.push(message) };

        const result = runMigration({ dataDir, databasePath, log });

        assert.deepEqual(result, { imported: 0, skipped: 0, errors: 1 });
        assert.equal(fs.existsSync(databasePath), false);
        assert.ok(messages.some((message) => message.includes('Invalid broken.json')));
    });

    test('imports atomically, preserves source files, and safely skips IDs on rerun', () => {
        const dataDir = path.join(directory, 'import-data');
        const databasePath = path.join(directory, 'import.sqlite');
        const sourcePath = path.join(dataDir, 'import-me.json');
        fs.mkdirSync(dataDir);
        fs.writeFileSync(sourcePath, JSON.stringify({
            config: { users: ['Alice'], dates: ['2026-10-20'], minPeople: 1 },
            responses: { Alice: { '2026-10-20': false } }
        }));
        const log = { log() {}, error() {} };

        assert.deepEqual(runMigration({ dataDir, databasePath, log }), {
            imported: 1,
            skipped: 0,
            errors: 0
        });
        assert.equal(fs.existsSync(sourcePath), true);

        const database = openDatabase(databasePath);
        try {
            assert.equal(database.getPoll('import-me').responses.Alice['2026-10-20'], false);
        } finally {
            database.close();
        }

        assert.deepEqual(runMigration({ dataDir, databasePath, log }), {
            imported: 0,
            skipped: 1,
            errors: 0
        });
    });
});
