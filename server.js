const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('public'));

const DATA_DIR = path.join(__dirname, 'data');

const ensureDataDir = () => {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
};

const sanitizePollId = (rawId) => {
    if (!rawId) return null;
    if (!/^[a-z0-9_-]+$/i.test(rawId)) return null;
    return rawId;
};

const getPollFilePath = (pollId) => path.join(DATA_DIR, `${pollId}.json`);

const loadPoll = (pollId) => {
    ensureDataDir();
    const pollFile = getPollFilePath(pollId);
    if (!fs.existsSync(pollFile)) {
        return null;
    }
    return JSON.parse(fs.readFileSync(pollFile));
};

const savePoll = (pollId, poll) => {
    ensureDataDir();
    const pollFile = getPollFilePath(pollId);
    fs.writeFileSync(pollFile, JSON.stringify(poll, null, 2));
};

app.get('/api/poll', (req, res) => {
    const pollId = sanitizePollId(req.query.id);
    if (!pollId) {
        res.status(400).json({ error: "Identifiant du sondage manquant ou invalide" });
        return;
    }
    const poll = loadPoll(pollId);
    if (!poll) {
        res.status(404).json({ error: 'Sondage introuvable' });
        return;
    }
    res.json(poll);
});

app.patch('/api/poll', (req, res) => {
    const pollId = sanitizePollId(req.query.id);
    if (!pollId) {
        res.status(400).json({ error: "Identifiant du sondage manquant ou invalide" });
        return;
    }
    const { user, updates } = req.body;
    if (!user) {
        res.status(400).json({ error: 'Utilisateur manquant' });
        return;
    }

    const poll = loadPoll(pollId);
    if (!poll) {
        res.status(404).json({ error: 'Sondage introuvable' });
        return;
    }

    if (!poll.responses[user]) {
        poll.responses[user] = {};
    }

    if (Array.isArray(updates)) {
        for (const upd of updates) {
            if (!upd.date || typeof upd.available !== 'boolean') {
                res.status(400).json({ error: 'Chaque mise à jour doit avoir une date et une disponibilité (booléen)' });
                return;
            }
            if (!poll.config.dates.includes(upd.date)) {
                res.status(400).json({ error: `La date ${upd.date} n'existe pas dans ce sondage` });
                return;
            }
        }
        updates.forEach(upd => {
            poll.responses[user][upd.date] = upd.available;
        });
    } else {
        res.status(400).json({ error: 'Le champ updates doit être un tableau' });
        return;
    }

    savePoll(pollId, poll);
    res.json(poll);
});

app.post('/api/poll', (req, res) => {
    const pollId = sanitizePollId(req.body.id);
    if (!pollId) {
        res.status(400).json({ error: "Identifiant du sondage invalide" });
        return;
    }

    const pollFile = getPollFilePath(pollId);
    if (fs.existsSync(pollFile)) {
        res.status(400).json({ error: "Ce sondage existe déjà" });
        return;
    }

    const { users, dates, minPeople } = req.body;
    if (!Array.isArray(users) || users.length === 0) {
        res.status(400).json({ error: "La liste des participants est requise" });
        return;
    }
    if (!Array.isArray(dates) || dates.length === 0) {
        res.status(400).json({ error: "La liste des dates est requise" });
        return;
    }

    const poll = {
        config: {
            users,
            dates,
            minPeople: Number(minPeople) || 0
        },
        responses: {}
    };

    savePoll(pollId, poll);
    res.json({ id: pollId, ...poll });
});

app.listen(3000, () => console.log('Server running on port 3000'));
