const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const { startServer } = require('../../src/server/server');

const createTestDependencies = ({ listenCallbackError = null } = {}) => {
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
            callback(listenCallbackError);
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
        logger: {
            log: (...args) => logs.push({ level: 'log', args }),
            error: (...args) => logs.push({ level: 'error', args })
        }
    };
};

describe('server startup', () => {
    test('reports a listen callback error, closes the database, and sets a failing exit code', () => {
        const error = Object.assign(new Error('address already in use'), { code: 'EADDRINUSE' });
        const dependencies = createTestDependencies({ listenCallbackError: error });

        startServer({ ...dependencies, port: 3000 });

        assert.equal(dependencies.processObject.exitCode, 1);
        assert.equal(dependencies.database.closeCalls, 1);
        assert.equal(dependencies.logs.filter((entry) => entry.level === 'error').length, 1);
        assert.equal(dependencies.logs.some((entry) => entry.args[0] === 'Server running on port 3000'), false);
    });

    test('handles listen errors emitted by the server and closes the database only once', () => {
        const dependencies = createTestDependencies();
        startServer({ ...dependencies, port: 3001 });

        dependencies.serverEvents.error(new Error('listen failed'));

        assert.equal(dependencies.processObject.exitCode, 1);
        assert.equal(dependencies.database.closeCalls, 1);
        assert.equal(dependencies.logs.filter((entry) => entry.level === 'error').length, 1);
    });

    test('logs startup only after a successful listen callback', () => {
        const dependencies = createTestDependencies();

        startServer({ ...dependencies, port: 3002 });

        assert.deepEqual(dependencies.logs, [
            { level: 'log', args: ['Server running on port 3002'] }
        ]);
        assert.equal(dependencies.database.closeCalls, 0);
    });
});
