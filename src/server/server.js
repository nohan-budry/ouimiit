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

const startServer = () => {
    const database = openDatabase();
    const app = createApp(database);
    const port = Number(process.env.PORT) || 3000;
    const server = app.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });

    const shutdown = () => {
        server.close(() => database.close());
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);

    return { app, server, database };
};

if (require.main === module) startServer();

module.exports = { createApp, startServer };
