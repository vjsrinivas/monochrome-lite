// js/lyrics.js
// Minimal lyric manager: fetches an LRC file from the gateway and renders
// line-level synced lyrics (highlight + click-to-seek). No karaoke widget,
// no romaji, no timing offsets.
import { getTrackTitle, getTrackArtists, buildTrackFilename } from './utils.js';
import { normalizeKey } from './gateway-api.js';
import { SVG_CLOSE } from './icons.ts';
import { sidePanelManager } from './side-panel.js';

export class LyricsManager {
    static #instance = null;

    static get instance() {
        if (!LyricsManager.#instance) throw new Error('LyricsManager is not initialized.');
        return LyricsManager.#instance;
    }

    /** @private */
    constructor(api) {
        this.api = api; // MusicAPI instance
        this.cache = new Map();
    }

    static async initialize(api) {
        if (LyricsManager.#instance) throw new Error('LyricsManager is already initialized');
        return (LyricsManager.#instance = new LyricsManager(api));
    }

    async fetchLyrics(trackId, _track = null) {
        if (!trackId) return null;
        if (this.cache.has(trackId)) return this.cache.get(trackId);

        let data = null;
        try {
            const gw = this.api?.getAPI?.();
            if (!gw?.gatewayUrl) return null;

            const key = normalizeKey(String(trackId));
            const encoded = key.split('/').map(encodeURIComponent).join('/');
            const res = await fetch(`${gw.gatewayUrl}/audio/lyrics/${encoded}`, {
                headers: gw._headers(),
                signal: AbortSignal.timeout(10000),
            });

            if (res.ok) {
                const text = await res.text();
                if (text && text.trim()) data = { subtitles: text, lyricsProvider: 'gateway' };
            }
        } catch {
            data = null;
        }

        this.cache.set(trackId, data);
        return data;
    }

    parseSyncedLyrics(subtitles) {
        if (!subtitles) return [];
        return subtitles
            .split('\n')
            .map((line) => {
                line = line.trim();
                const match = line.match(/\[(\d+):(\d+)\.(\d+)\]\s*(.+)/);
                if (!match) return null;
                const [, minutes, seconds, centis, text] = match;
                const time = parseInt(minutes, 10) * 60 + parseInt(seconds, 10) + parseInt(centis, 10) / 100;
                return { time, text: text.trim() };
            })
            .filter(Boolean);
    }

    generateLRCContent(lyricsData, track) {
        if (!lyricsData?.subtitles) return null;
        return (
            `[ti:${getTrackTitle(track)}]\n` +
            `[ar:${getTrackArtists(track)}]\n` +
            `[al:${track?.album?.title || 'Unknown Album'}]\n` +
            `[by:${lyricsData.lyricsProvider || 'Unknown'}]\n\n` +
            `${lyricsData.subtitles}`
        );
    }

    getLRC(lyricsData, track) {
        const lrc = this.generateLRCContent(lyricsData, track);
        if (!lrc) return null;
        return new File([lrc], buildTrackFilename(track, 'LOSSLESS').replace(/\.flac$/, '.lrc'), {
            type: 'application/octet-stream',
        });
    }
}

function renderLines(container, lines, audioPlayer) {
    container.innerHTML = '';
    const els = lines.map(({ time, text }) => {
        const el = document.createElement('div');
        el.className = 'lrc-line';
        el.textContent = text;
        el.addEventListener('click', () => {
            if (audioPlayer) {
                audioPlayer.currentTime = time;
                audioPlayer.play?.();
            }
        });
        container.appendChild(el);
        return el;
    });
    container._lyricsActiveIndex = -1;
    return els;
}

function updateActive(container, els, lines, currentTime) {
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (currentTime >= lines[i].time) idx = i;
        else break;
    }
    if (idx === container._lyricsActiveIndex) return;
    container._lyricsActiveIndex = idx;
    els.forEach((el, i) => el.classList.toggle('active', i === idx));
    if (idx >= 0) els[idx].scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// LRC has line-level timestamps; the browser's ~4Hz timeupdate is enough.
function attachSync(container, els, lines, audioPlayer) {
    if (!audioPlayer) return () => {};

    const update = () => updateActive(container, els, lines, audioPlayer.currentTime);
    audioPlayer.addEventListener('timeupdate', update);
    audioPlayer.addEventListener('play', update);
    audioPlayer.addEventListener('pause', update);
    update();

    return () => {
        audioPlayer.removeEventListener('timeupdate', update);
        audioPlayer.removeEventListener('play', update);
        audioPlayer.removeEventListener('pause', update);
    };
}

async function renderLyrics(track, audioPlayer, lyricsManager, container) {
    clearLyricsSync(container);
    container.innerHTML = '<div class="lyrics-loading">Loading lyrics...</div>';

    const data = lyricsManager ? await lyricsManager.fetchLyrics(track.id, track) : null;
    const lines = data ? lyricsManager.parseSyncedLyrics(data.subtitles) : [];

    if (!data || lines.length === 0) {
        const emptyClass = container.id === 'fullscreen-lyrics-content' ? 'fullscreen-lyrics-empty' : 'lyrics-error';
        container.innerHTML = `<div class="${emptyClass}">Lyrics are not available for this track.</div>`;
        return;
    }

    const els = renderLines(container, lines, audioPlayer);
    container.lyricsCleanup = attachSync(container, els, lines, audioPlayer);
}

export async function renderLyricsInFullscreen(track, audioPlayer, lyricsManager, container) {
    return renderLyrics(track, audioPlayer, lyricsManager, container);
}

function clearLyricsSync(container) {
    if (container?.lyricsCleanup) {
        container.lyricsCleanup();
        container.lyricsCleanup = null;
    }
    container.lyricsManager = null;
}

export function clearFullscreenLyricsSync(container) {
    clearLyricsSync(container);
}

export function clearLyricsPanelSync(_audioPlayer, panel) {
    clearLyricsSync(panel);
}

export function openLyricsPanel(track, audioPlayer, lyricsManager, forceOpen = false) {
    const renderControls = (container) => {
        const btn = document.createElement('button');
        btn.className = 'btn-icon';
        btn.title = 'Close';
        btn.innerHTML = SVG_CLOSE(20);
        btn.addEventListener('click', () => {
            sidePanelManager.close();
            clearLyricsPanelSync(audioPlayer, sidePanelManager.panel);
        });
        container.appendChild(btn);
    };

    const renderContent = async (container) => {
        await renderLyricsInFullscreen(track, audioPlayer, lyricsManager, container);
        if (container.lyricsCleanup) {
            sidePanelManager.panel.lyricsCleanup = container.lyricsCleanup;
        }
    };

    sidePanelManager.open('lyrics', 'Lyrics', renderControls, renderContent, forceOpen);
}