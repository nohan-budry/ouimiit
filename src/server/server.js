const express = require('express');
const path = require('path');
const { openDatabase } = require('./db/database');
const { registerPollRoutes } = require('./routes/polls');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

const createApp = (database) => {
    const app = express();

    app.use(express.json());
    app.use(express.static(path.join(PROJECT_ROOT, 'public')));
    registerPollRoutes(app, database);

    return app;
};

const startServer = (options = {}) => {
    const database = options.database ?? openDatabase();
    const app = options.app ?? createApp(database);
    const port = options.port ?? (Number(process.env.PORT) || 3000);
    const logger = options.logger ?? console;
    const processObject = options.processObject ?? process;
    let listenFailed = false;
    let databaseClosed = false;

    const closeDatabase = () => {
        if (databaseClosed) return;
        databaseClosed = true;
        database.close();
    };

    const handleListenError = (error) => {
        if (listenFailed) return;
        listenFailed = true;
        processObject.exitCode = 1;
        logger.error(`Failed to start server on port ${port}:`, error);
        try {
            closeDatabase();
        } catch (closeError) {
            logger.error('Failed to close the database after the listen error:', closeError);
        }
    };

    const server = app.listen(port, (error) => {
        if (error) {
            handleListenError(error);
            return;
        }
        if (!listenFailed) logger.log(`Server running on port ${port}`);
    });
    server.on('error', handleListenError);

    const shutdown = () => {
        server.close(closeDatabase);
    };
    processObject.once('SIGINT', shutdown);
    processObject.once('SIGTERM', shutdown);

    return { app, server, database };
};

if (require.main === module) startServer();

module.exports = { createApp, startServer };
