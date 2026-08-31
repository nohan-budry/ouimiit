const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'index.html'),
    'utf8'
);

test('date input layout can shrink within the creation card', () => {
    assert.match(
        html,
        /<div class="min-w-0">\s*<label[^>]*>Dates<\/label>/
    );
    assert.match(
        html,
        /<div class="flex min-w-0 items-center gap-2">/
    );
    assert.match(
        html,
        /<div class="relative min-w-0 flex-1">/
    );
    assert.match(
        html,
        /<input\s+type="date"[\s\S]*?class="w-full min-w-0 [^"]*">/
    );
});

test('date delete button remains visible when the input shrinks', () => {
    assert.match(
        html,
        /<button\s+@click="removeDate\(index\)"\s+class="shrink-0 [^"]*"/
    );
});
