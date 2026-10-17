const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const { createPollHandlers } = require('../../src/server/server');
const {
    PollNotFoundError,
    ParticipantNotFoundError,
    PollDateNotFoundError
} = require('../../src/server/db/database');

const makeResponse = () => ({
    statusCode: 200,
    body: undefined,
    status(statusCode) {
        this.statusCode = statusCode;
        return this;
    },
    json(body) {
        this.body = body;
        return this;
    }
});

const makeDatabase = ({ poll = null, created = true, updateError = null } = {}) => {
    const calls = [];

    return {
        calls,
        getPoll(pollId) {
            calls.push({ method: 'getPoll', args: [pollId] });
            return poll;
        },
        createPoll(...args) {
            calls.push({ method: 'createPoll', args });
            return created;
        },
        updateResponses(...args) {
            calls.push({ method: 'updateResponses', args });
            if (updateError) throw updateError;
            return poll;
        }
    };
};

describe('server route handlers', { concurrency: false }, () => {
    test('GET handler fetches a poll by id and returns it', () => {
        const poll = { config: { users: ['Alice'], dates: [], minPeople: 0 }, responses: {} };
        const database = makeDatabase({ poll });
        const response = makeResponse();

        createPollHandlers(database).getPoll({ query: { id: 'team-a' } }, response);

        assert.deepEqual(database.calls, [{ method: 'getPoll', args: ['team-a'] }]);
        assert.equal(response.statusCode, 200);
        assert.equal(response.body, poll);
    });

    test('GET handler rejects an invalid id without calling the database', () => {
        const database = makeDatabase();
        const response = makeResponse();

        createPollHandlers(database).getPoll({ query: { id: '../secret' } }, response);

        assert.deepEqual(database.calls, []);
        assert.equal(response.statusCode, 400);
    });

    test('GET handler returns 404 when the database has no poll', () => {
        const database = makeDatabase();
        const response = makeResponse();

        createPollHandlers(database).getPoll({ query: { id: 'missing' } }, response);

        assert.deepEqual(database.calls, [{ method: 'getPoll', args: ['missing'] }]);
        assert.equal(response.statusCode, 404);
    });

    test('PATCH handler passes the poll id, user, and updates to the database', () => {
        const poll = { config: { users: ['Alice'], dates: [], minPeople: 0 }, responses: {} };
        const database = makeDatabase({ poll });
        const updates = [{ date: '2026-10-20', available: false }];
        const response = makeResponse();

        createPollHandlers(database).updatePoll(
            { query: { id: 'team-a' }, body: { user: 'Alice', updates } },
            response
        );

        assert.deepEqual(database.calls, [
            { method: 'updateResponses', args: ['team-a', 'Alice', updates] }
        ]);
        assert.equal(response.statusCode, 200);
        assert.equal(response.body, poll);
    });

    test('PATCH handler validates update items before calling the database', () => {
        const database = makeDatabase();
        const response = makeResponse();

        createPollHandlers(database).updatePoll(
            { query: { id: 'team-a' }, body: { user: 'Alice', updates: [null] } },
            response
        );

        assert.deepEqual(database.calls, []);
        assert.equal(response.statusCode, 400);
    });

    test('PATCH handler maps database lookup errors to API responses', () => {
        const cases = [
            [new PollNotFoundError('missing'), 404, 'Sondage introuvable'],
            [new ParticipantNotFoundError('Mallory'), 400, 'Utilisateur invalide'],
            [new PollDateNotFoundError('2026-10-22'), 400, "La date 2026-10-22 n'existe pas dans ce sondage"]
        ];

        for (const [error, expectedStatus, expectedMessage] of cases) {
            const database = makeDatabase({ updateError: error });
            const response = makeResponse();

            createPollHandlers(database).updatePoll(
                {
                    query: { id: 'team-a' },
                    body: { user: 'Alice', updates: [{ date: '2026-10-20', available: true }] }
                },
                response
            );

            assert.equal(response.statusCode, expectedStatus);
            assert.equal(response.body.error, expectedMessage);
        }
    });

    test('POST handler normalizes creation data and fetches the created poll', () => {
        const poll = { config: { users: ['Alice', 'Bob'], dates: ['2026-10-20'], minPeople: 1 }, responses: {} };
        const database = makeDatabase({ poll });
        const response = makeResponse();

        createPollHandlers(database).createPoll({
            body: {
                id: 'team-a',
                users: [' Alice ', 'Bob'],
                dates: ['2026-10-20'],
                minPeople: '1'
            }
        }, response);

        assert.deepEqual(database.calls, [
            { method: 'createPoll', args: ['team-a', { users: ['Alice', 'Bob'], dates: ['2026-10-20'], minPeople: 1 }] },
            { method: 'getPoll', args: ['team-a'] }
        ]);
        assert.equal(response.statusCode, 200);
        assert.deepEqual(response.body, { id: 'team-a', ...poll });
    });

    test('POST handler reports duplicate polls without fetching them', () => {
        const database = makeDatabase({ created: false });
        const response = makeResponse();

        createPollHandlers(database).createPoll({
            body: {
                id: 'team-a',
                users: ['Alice'],
                dates: ['2026-10-20']
            }
        }, response);

        assert.deepEqual(database.calls, [
            { method: 'createPoll', args: ['team-a', { users: ['Alice'], dates: ['2026-10-20'], minPeople: 0 }] }
        ]);
        assert.equal(response.statusCode, 400);
        assert.equal(response.body.error, 'Ce sondage existe déjà');
    });

    test('POST handler rejects invalid dates before calling the database', () => {
        const database = makeDatabase();
        const response = makeResponse();

        createPollHandlers(database).createPoll({
            body: { id: 'team-a', users: ['Alice'], dates: ['2026-02-30'] }
        }, response);

        assert.deepEqual(database.calls, []);
        assert.equal(response.statusCode, 400);
    });
});
