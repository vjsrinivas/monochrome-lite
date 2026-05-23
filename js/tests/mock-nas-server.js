// Mock NAS server for testing NAS streaming pipeline
// Serves mock audio files and supports quality-based path resolution

const http = require('http');

const MOCK_AUDIO_BLOB = Buffer.from(
    'RIFF' +
        '\x00\x00\x00\x00' +
        'WAVE' +
        'fmt ' +
        '\x10\x00\x00\x00' +
        '\x01\x00\x02\x00\x44\xAC\x00\x00\x10\xB1\x02\x00\x04\x00\x10\x00' +
        'data' +
        '\x00\x00\x00\x00',
    'binary'
);

const FLAC_HEADER = Buffer.from(
    'fLaC' +
        '\x00\x00\x00\x21' +
        '\x80\x44\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00' +
        '\x80\x44\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00' +
        '\x00',
    'binary'
);

const MP3_HEADER = Buffer.from(
    '\xFF\xFB\x90\x00' +
        '\x00\x00\x00\x00' +
        '\x00\x00\x00\x00' +
        '\x00\x00\x00\x00' +
        '\x00\x00\x00\x00' +
        '\x00\x00\x00\x00' +
        '\x00\x00\x00\x00' +
        '\x00\x00\x00\x00',
    'binary'
);

function getMockContent(quality) {
    if (quality === 'HI_RES_LOSSLESS' || quality === 'LOSSLESS') {
        return FLAC_HEADER;
    }
    return MP3_HEADER;
}

function getMockMimeType(quality) {
    if (quality === 'HI_RES_LOSSLESS' || quality === 'LOSSLESS') {
        return 'audio/flac';
    }
    return 'audio/mpeg';
}

const TRACK_DATABASE = {
    ISRC12345678: { quality: 'HI_RES_LOSSLESS', duration: 180, title: 'Test Track 1' },
    ISRC12345679: { quality: 'LOSSLESS', duration: 200, title: 'Test Track 2' },
    ISRC12345680: { quality: 'HIGH', duration: 150, title: 'Test Track 3' },
    12345678: { quality: 'HI_RES_LOSSLESS', duration: 180, title: 'TIDAL ID Track 1' },
    12345679: { quality: 'LOSSLESS', duration: 200, title: 'TIDAL ID Track 2' },
};

function createMockServer(port = 9876) {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://localhost:${port}`);
        const path = url.pathname;

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Range');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (path === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', server: 'mock-nas' }));
            return;
        }

        if (path === '/resolve') {
            const id = url.searchParams.get('id');
            const quality = url.searchParams.get('quality');

            if (!id) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing id parameter' }));
                return;
            }

            const track = TRACK_DATABASE[id];
            if (!track) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Track not found' }));
                return;
            }

            const ext = quality === 'HI_RES_LOSSLESS' || quality === 'LOSSLESS' ? 'flac' : 'mp3';
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ path: `/music/${id}.${ext}` }));
            return;
        }

        if (path.startsWith('/music/')) {
            const filename = path.replace('/music/', '');
            const [identifier, ext] = filename.split('.');

            const track = TRACK_DATABASE[identifier];
            if (!track) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Track not found on NAS' }));
                return;
            }

            const quality = url.searchParams.get('quality') || track.quality;
            const content = getMockContent(quality);
            const mimeType = getMockMimeType(quality);

            res.writeHead(200, {
                'Content-Type': mimeType,
                'Content-Length': content.length,
                'Accept-Ranges': 'bytes',
            });
            res.end(content);
            return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    });

    return new Promise((resolve) => {
        server.listen(port, () => {
            console.log(`Mock NAS server running on http://localhost:${port}`);
            resolve(server);
        });
    });
}

module.exports = { createMockServer, MOCK_AUDIO_BLOB, FLAC_HEADER, MP3_HEADER };
