const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const { createPollHandlers, registerPollRoutes } = require('../../../src/server/routes/polls');
const {
    PollNotFoundError,
    ParticipantNotFoundError,
    PollDateNotFoundError
} = require('../../../src/server/db/database');

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

const makeDatabase = ({
    poll = null,
    created = true,
    getPollError = null,
    createError = null,
    updateError = null
} = {}) => {
    const calls = [];

    return {
        calls,
        getPoll(pollId) {
            calls.push({ method: 'getPoll', args: [pollId] });
            if (getPollError) throw getPollError;
            return poll;
        },
        createPoll(...args) {
            calls.push({ method: 'createPoll', args });
            if (createError) throw createError;
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
    test('registers the GET, PATCH, and POST poll routes', () => {
        const database = makeDatabase();
        const registrations = [];
        const app = {
            get: (route, handler) => registrations.push({ method: 'GET', route, handler }),
            patch: (route, handler) => registrations.push({ method: 'PATCH', route, handler }),
            post: (route, handler) => registrations.push({ method: 'POST', route, handler })
        };

        const handlers = registerPollRoutes(app, database);

        assert.deepEqual(
            registrations.map(({ method, route }) => ({ method, route })),
            [
                { method: 'GET', route: '/api/poll' },
                { method: 'PATCH', route: '/api/poll' },
                { method: 'POST', route: '/api/poll' }
            ]
        );
        assert.equal(registrations[0].handler, handlers.getPoll);
        assert.equal(registrations[1].handler, handlers.updatePoll);
        assert.equal(registrations[2].handler, handlers.createPoll);
    });

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
        for (const id of ['../secret', ['team-a']]) {
            const database = makeDatabase();
            const response = makeResponse();

            createPollHandlers(database).getPoll({ query: { id } }, response);

            assert.deepEqual(database.calls, []);
            assert.equal(response.statusCode, 400);
        }
    });

    test('GET handler rejects a missing id without calling the database', () => {
        const database = makeDatabase();
        const response = makeResponse();

        createPollHandlers(database).getPoll({ query: {} }, response);

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

    test('GET handler returns a generic 500 when the database fails', () => {
        const database = makeDatabase({ getPollError: new Error('private database detail') });
        const response = makeResponse();
        const originalConsoleError = console.error;
        console.error = () => {};

        try {
            createPollHandlers(database).getPoll({ query: { id: 'team-a' } }, response);
        } finally {
            console.error = originalConsoleError;
        }

        assert.deepEqual(database.calls, [{ method: 'getPoll', args: ['team-a'] }]);
        assert.equal(response.statusCode, 500);
        assert.equal(response.body.error, 'Erreur interne du serveur');
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

    test('PATCH handler rejects an invalid id without calling the database', () => {
        const database = makeDatabase();
        const response = makeResponse();

        createPollHandlers(database).updatePoll(
            { query: { id: '../secret' }, body: { user: 'Alice', updates: [] } },
            response
        );

        assert.deepEqual(database.calls, []);
        assert.equal(response.statusCode, 400);
    });

    test('PATCH handler validates update items before calling the database', () => {
        for (const update of [null, 'not-an-object']) {
            const database = makeDatabase();
            const response = makeResponse();

            createPollHandlers(database).updatePoll(
                { query: { id: 'team-a' }, body: { user: 'Alice', updates: [update] } },
                response
            );

            assert.deepEqual(database.calls, []);
            assert.equal(response.statusCode, 400);
        }
    });

    test('PATCH handler rejects malformed update fields without calling the database', () => {
        const cases = [
            [{ date: '', available: true }],
            [{ date: '2026-10-20', available: 'yes' }],
            [{ date: 20261020, available: true }]
        ];

        for (const updates of cases) {
            const database = makeDatabase();
            const response = makeResponse();

            createPollHandlers(database).updatePoll(
                { query: { id: 'team-a' }, body: { user: 'Alice', updates } },
                response
            );

            assert.deepEqual(database.calls, []);
            assert.equal(response.statusCode, 400);
        }
    });

    test('PATCH handler rejects missing users and non-array updates without database calls', () => {
        const cases = [
            [{ user: '', updates: [] }, 'Utilisateur manquant'],
            [{ user: 12, updates: [] }, 'Utilisateur manquant'],
            [{ user: 'Alice', updates: null }, 'Le champ updates doit être un tableau']
        ];

        for (const [body, expectedMessage] of cases) {
            const database = makeDatabase();
            const response = makeResponse();

            createPollHandlers(database).updatePoll({ query: { id: 'team-a' }, body }, response);

            assert.deepEqual(database.calls, []);
            assert.equal(response.statusCode, 400);
            assert.equal(response.body.error, expectedMessage);
        }
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
            assert.deepEqual(database.calls, [
                {
                    method: 'updateResponses',
                    args: ['team-a', 'Alice', [{ date: '2026-10-20', available: true }]]
                }
            ]);
        }
    });

    test('PATCH handler returns a generic 500 for unexpected database errors', () => {
        const database = makeDatabase({ updateError: new Error('private database detail') });
        const response = makeResponse();
        const originalConsoleError = console.error;
        console.error = () => {};

        try {
            createPollHandlers(database).updatePoll(
                {
                    query: { id: 'team-a' },
                    body: { user: 'Alice', updates: [{ date: '2026-10-20', available: true }] }
                },
                response
            );
        } finally {
            console.error = originalConsoleError;
        }

        assert.deepEqual(database.calls, [
            { method: 'updateResponses', args: ['team-a', 'Alice', [{ date: '2026-10-20', available: true }]] }
        ]);
        assert.equal(response.statusCode, 500);
        assert.equal(response.body.error, 'Erreur interne du serveur');
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

    test('POST handler rejects invalid inputs before calling the database', () => {
        const cases = [
            [{ users: ['Alice'], dates: ['2026-10-20'] }, 'Identifiant du sondage invalide'],
            [{ id: '../bad', users: ['Alice'], dates: ['2026-10-20'] }, 'Identifiant du sondage invalide'],
            [{ id: 'missing-users', users: [], dates: ['2026-10-20'] }, 'La liste des participants est requise'],
            [{ id: 'non-array-users', users: 'Alice', dates: ['2026-10-20'] }, 'La liste des participants est requise'],
            [{ id: 'invalid-user', users: [' '], dates: ['2026-10-20'] }, 'La liste des participants est requise'],
            [{ id: 'non-string-user', users: [null], dates: ['2026-10-20'] }, 'La liste des participants est requise'],
            [{ id: 'duplicate-users', users: ['Alice', ' Alice '], dates: ['2026-10-20'] }, 'Les participants doivent être uniques'],
            [{ id: 'missing-dates', users: ['Alice'], dates: [] }, 'La liste des dates est requise'],
            [{ id: 'non-array-dates', users: ['Alice'], dates: '2026-10-20' }, 'La liste des dates est requise'],
            [{ id: 'invalid-date-format', users: ['Alice'], dates: ['tomorrow'] }, 'Chaque date doit être une date valide au format AAAA-MM-JJ'],
            [{ id: 'non-string-date', users: ['Alice'], dates: [null] }, 'Chaque date doit être une date valide au format AAAA-MM-JJ'],
            [{ id: 'duplicate-dates', users: ['Alice'], dates: ['2026-10-20', '2026-10-20'] }, 'Les dates doivent être uniques'],
            [{ id: 'negative-minimum', users: ['Alice'], dates: ['2026-10-20'], minPeople: -1 }, 'Le nombre minimum de personnes doit être un entier positif ou nul'],
            [{ id: 'fractional-minimum', users: ['Alice'], dates: ['2026-10-20'], minPeople: 1.5 }, 'Le nombre minimum de personnes doit être un entier positif ou nul']
        ];

        for (const [body, expectedMessage] of cases) {
            const database = makeDatabase();
            const response = makeResponse();

            createPollHandlers(database).createPoll({ body }, response);

            assert.deepEqual(database.calls, []);
            assert.equal(response.statusCode, 400);
            assert.equal(response.body.error, expectedMessage);
        }
    });

    test('POST handler returns a generic 500 if the database fails', () => {
        const database = makeDatabase({ createError: new Error('private database detail') });
        const response = makeResponse();
        const originalConsoleError = console.error;
        console.error = () => {};

        try {
            createPollHandlers(database).createPoll({
                body: { id: 'team-a', users: ['Alice'], dates: ['2026-10-20'] }
            }, response);
        } finally {
            console.error = originalConsoleError;
        }

        assert.deepEqual(database.calls, [
            { method: 'createPoll', args: ['team-a', { users: ['Alice'], dates: ['2026-10-20'], minPeople: 0 }] }
        ]);
        assert.equal(response.statusCode, 500);
        assert.equal(response.body.error, 'Erreur interne du serveur');
    });

    test('POST handler returns a generic 500 if the created poll cannot be read back', () => {
        const database = makeDatabase({ created: true });
        const response = makeResponse();
        const originalConsoleError = console.error;
        console.error = () => {};

        try {
            createPollHandlers(database).createPoll({
                body: { id: 'team-a', users: ['Alice'], dates: ['2026-10-20'] }
            }, response);
        } finally {
            console.error = originalConsoleError;
        }

        assert.deepEqual(database.calls, [
            { method: 'createPoll', args: ['team-a', { users: ['Alice'], dates: ['2026-10-20'], minPeople: 0 }] },
            { method: 'getPoll', args: ['team-a'] }
        ]);
        assert.equal(response.statusCode, 500);
        assert.equal(response.body.error, 'Erreur interne du serveur');
    });
});
