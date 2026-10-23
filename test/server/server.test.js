const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const { createApp, startServer } = require('../../src/server/server');

const createTestDependencies = () => {
    const logs = [];
    const processObject = {
        exitCode: 0,
        once() {}
    };
    const database = {
        closeCalls: 0,
        close() {
            this.closeCalls++;
        }
    };
    const serverEvents = {};
    let listenCallback;
    const server = {
        on(event, handler) {
            serverEvents[event] = handler;
            return this;
        },
        close(callback) {
            callback();
        }
    };
    const app = {
        listen(port, callback) {
            this.port = port;
            listenCallback = callback;
            return server;
        }
    };

    return {
        app,
        database,
        logs,
        processObject,
        server,
        serverEvents,
        completeListen() {
            listenCallback();
        },
        logger: {
            log: (...args) => logs.push({ level: 'log', args }),
            error: (...args) => logs.push({ level: 'error', args })
        }
    };
};

describe('server startup', () => {
    test('handles listen errors emitted by the server, logs them, and closes the database once', () => {
        const dependencies = createTestDependencies();
        startServer({ ...dependencies, port: 3001 });

        const error = Object.assign(new Error('address already in use'), { code: 'EADDRINUSE' });
        dependencies.serverEvents.error(error);
        dependencies.serverEvents.error(error);

        assert.equal(dependencies.processObject.exitCode, 1);
        assert.equal(dependencies.database.closeCalls, 1);
        assert.equal(dependencies.logs.filter((entry) => entry.level === 'error').length, 1);
        assert.equal(dependencies.logs[0].args[1], error);
        assert.equal(dependencies.logs.some((entry) => entry.args[0] === 'Server running on port 3001'), false);
    });

    test('logs startup only after a successful listen callback', () => {
        const dependencies = createTestDependencies();

        startServer({ ...dependencies, port: 3002 });
        dependencies.completeListen();

        assert.deepEqual(dependencies.logs, [
            { level: 'log', args: ['Server running on port 3002'] }
        ]);
        assert.equal(dependencies.database.closeCalls, 0);
    });
});

test('returns a JSON error for malformed JSON requests', async () => {
    const app = createApp({});
    const server = app.listen(0, '127.0.0.1');

    try {
        await new Promise((resolve, reject) => {
            server.once('listening', resolve);
            server.once('error', reject);
        });

        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/poll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{'
        });

        assert.equal(response.status, 400);
        assert.match(response.headers.get('content-type'), /application\/json/);
        assert.deepEqual(await response.json(), { error: 'JSON invalide' });
    } finally {
        await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
    }
});
