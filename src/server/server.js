const express = require('express');
const path = require('path');
const {
    openDatabase,
    PollNotFoundError,
    ParticipantNotFoundError,
    PollDateNotFoundError
} = require('./db/database');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

const sanitizePollId = (rawId) => {
    if (!rawId) return null;
    if (typeof rawId !== 'string' || !/^[a-z0-9_-]+$/i.test(rawId)) return null;
    return rawId;
};

const isValidDate = (date) => {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};

const internalError = (res, error) => {
    console.error('Poll request failed:', error);
    return res.status(500).json({ error: 'Erreur interne du serveur' });
};

const createPollHandlers = (database) => ({
    getPoll(req, res) {
        const pollId = sanitizePollId(req.query.id);
        if (!pollId) {
            return res.status(400).json({ error: 'Identifiant du sondage manquant ou invalide' });
        }

        try {
            const poll = database.getPoll(pollId);
            if (!poll) return res.status(404).json({ error: 'Sondage introuvable' });
            return res.json(poll);
        } catch (error) {
            return internalError(res, error);
        }
    },

    updatePoll(req, res) {
        const pollId = sanitizePollId(req.query.id);
        if (!pollId) {
            return res.status(400).json({ error: 'Identifiant du sondage manquant ou invalide' });
        }

        const body = req.body ?? {};
        const { user, updates } = body;
        if (typeof user !== 'string' || !user.trim()) {
            return res.status(400).json({ error: 'Utilisateur manquant' });
        }
        if (!Array.isArray(updates)) {
            return res.status(400).json({ error: 'Le champ updates doit être un tableau' });
        }
        for (const update of updates) {
            if (
                !update ||
                typeof update !== 'object' ||
                typeof update.date !== 'string' ||
                !update.date ||
                typeof update.available !== 'boolean'
            ) {
                return res.status(400).json({
                    error: 'Chaque mise à jour doit avoir une date et une disponibilité (booléen)'
                });
            }
        }

        try {
            return res.json(database.updateResponses(pollId, user, updates));
        } catch (error) {
            if (error instanceof PollNotFoundError) {
                return res.status(404).json({ error: 'Sondage introuvable' });
            }
            if (error instanceof ParticipantNotFoundError) {
                return res.status(400).json({ error: 'Utilisateur invalide' });
            }
            if (error instanceof PollDateNotFoundError) {
                return res.status(400).json({
                    error: `La date ${error.pollDate} n'existe pas dans ce sondage`
                });
            }
            return internalError(res, error);
        }
    },

    createPoll(req, res) {
        const body = req.body ?? {};
        const pollId = sanitizePollId(body.id);
        if (!pollId) {
            return res.status(400).json({ error: 'Identifiant du sondage invalide' });
        }

        if (
            !Array.isArray(body.users) ||
            body.users.length === 0 ||
            body.users.some((user) => typeof user !== 'string' || !user.trim())
        ) {
            return res.status(400).json({ error: 'La liste des participants est requise' });
        }
        const users = body.users.map((user) => user.trim());
        if (new Set(users).size !== users.length) {
            return res.status(400).json({ error: 'Les participants doivent être uniques' });
        }

        if (!Array.isArray(body.dates) || body.dates.length === 0) {
            return res.status(400).json({ error: 'La liste des dates est requise' });
        }
        if (!body.dates.every(isValidDate)) {
            return res.status(400).json({
                error: 'Chaque date doit être une date valide au format AAAA-MM-JJ'
            });
        }
        if (new Set(body.dates).size !== body.dates.length) {
            return res.status(400).json({ error: 'Les dates doivent être uniques' });
        }

        const minPeople = Number(body.minPeople) || 0;
        if (!Number.isInteger(minPeople) || minPeople < 0) {
            return res.status(400).json({
                error: 'Le nombre minimum de personnes doit être un entier positif ou nul'
            });
        }

        try {
            const created = database.createPoll(pollId, { users, dates: body.dates, minPeople });
            if (!created) return res.status(400).json({ error: 'Ce sondage existe déjà' });

            const poll = database.getPoll(pollId);
            if (!poll) return internalError(res, new Error('Created poll could not be read back'));
            return res.json({ id: pollId, ...poll });
        } catch (error) {
            return internalError(res, error);
        }
    }
});

const createApp = (database) => {
    const app = express();
    const handlers = createPollHandlers(database);

    app.use(express.json());
    app.use(express.static(path.join(PROJECT_ROOT, 'public')));
    app.get('/api/poll', handlers.getPoll);
    app.patch('/api/poll', handlers.updatePoll);
    app.post('/api/poll', handlers.createPoll);

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

module.exports = { createApp, createPollHandlers, sanitizePollId, startServer };
