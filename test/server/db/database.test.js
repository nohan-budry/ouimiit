const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, describe, it } = require('node:test');

const {
    openDatabase,
    PollNotFoundError,
    ParticipantNotFoundError,
    PollDateNotFoundError
} = require('../../../src/server/db/database');

describe('database layer', { concurrency: false }, () => {
    let database;
    let directory;

    before(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ouimiit-db-test-'));

        try {
            database = openDatabase(path.join(directory, 'test.sqlite'));
        } catch (error) {
            fs.rmSync(directory, { recursive: true, force: true });
            throw error;
        }
    });

    after(() => {
        try {
            database?.close();
        } finally {
            if (directory) {
                fs.rmSync(directory, { recursive: true, force: true });
            }
        }
    });

    const pollConfig = {
        users: ['Alice', 'Bob'],
        dates: ['2026-10-20', '2026-10-21'],
        minPeople: 2
    };

    it('applies the initial migration before the database tests', () => {
        assert.equal(database.getPoll('missing'), null);
        assert.deepEqual(
            database.database.prepare('SELECT VERSION FROM DB_MIGRATIONS').pluck().all(),
            ['001-initial-schema.sql']
        );
    });

    it('creates polls and preserves participant and date order', () => {
        assert.equal(database.createPoll('create-order', pollConfig), true);
        assert.deepEqual(database.getPoll('create-order').config, pollConfig);
        assert.deepEqual(Object.keys(database.getPoll('create-order').responses), []);
    });

    it('does not create a duplicate poll', () => {
        assert.equal(database.createPoll('duplicate-poll', pollConfig), true);
        assert.equal(database.createPoll('duplicate-poll', { ...pollConfig, minPeople: 1 }), false);
        assert.equal(database.getPoll('duplicate-poll').config.minPeople, 2);
    });

    it('stores explicit yes and no answers while leaving unanswered dates absent', () => {
        database.createPoll('response-states', pollConfig);

        const poll = database.updateResponses('response-states', 'Alice', [
            { date: '2026-10-20', available: true },
            { date: '2026-10-21', available: false }
        ]);

        assert.equal(poll.responses.Alice['2026-10-20'], true);
        assert.equal(poll.responses.Alice['2026-10-21'], false);
        assert.equal(poll.responses.Bob, undefined);
    });

    it('updates existing answers', () => {
        database.createPoll('update-response', pollConfig);
        database.updateResponses('update-response', 'Alice', [
            { date: '2026-10-20', available: true }
        ]);

        const poll = database.updateResponses('update-response', 'Alice', [
            { date: '2026-10-20', available: false }
        ]);

        assert.equal(poll.responses.Alice['2026-10-20'], false);
    });

    it('rejects unknown polls, participants, and dates', () => {
        database.createPoll('validation-errors', pollConfig);

        assert.throws(
            () => database.updateResponses('missing-poll', 'Alice', []),
            PollNotFoundError
        );
        assert.throws(
            () => database.updateResponses('validation-errors', 'Mallory', []),
            ParticipantNotFoundError
        );
        assert.throws(
            () => database.updateResponses('validation-errors', 'Alice', [
                { date: '2026-10-22', available: true }
            ]),
            PollDateNotFoundError
        );
    });

    it('validates all dates before writing any responses', () => {
        database.createPoll('atomic-updates', pollConfig);

        assert.throws(
            () => database.updateResponses('atomic-updates', 'Alice', [
                { date: '2026-10-20', available: true },
                { date: 'not-in-this-poll', available: false }
            ]),
            PollDateNotFoundError
        );
        assert.deepEqual(Object.keys(database.getPoll('atomic-updates').responses), []);
    });
});
