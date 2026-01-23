const express = require('express');
const fs = require('fs');
const config = require('./config');
const app = express();

app.use(express.json());
app.use(express.static('public'));

const DATA_FILE = './data/data.json';

if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({}));
}

app.get('/api/config', (req, res) => res.json(config));
app.get('/api/responses', (req, res) => {
    const data = JSON.parse(fs.readFileSync(DATA_FILE));
    res.json(data);
});

app.post('/api/responses', (req, res) => {
    const { user, availability } = req.body;
    const data = JSON.parse(fs.readFileSync(DATA_FILE));
    data[user] = availability;
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    res.sendStatus(200);
});

app.listen(3000, () => console.log('Server running on port 3000'));
