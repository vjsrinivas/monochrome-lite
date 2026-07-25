// js/gateway-api.js
import { APICache } from './cache.js';

export class GatewayAPI {
    constructor(gatewayUrl, apiKey) {
        this.gatewayUrl = (gatewayUrl || '').replace(/\/+$/, '');
        this.apiKey = apiKey || '';
        this.cache = new APICache({
            maxSize: 200,
            ttl: 1000 * 60 * 5,
        });
        this.onConnectionChange = null;
        this.#connected = true;
        this.#checkInterval = null;

        setInterval(async () => {
            await this.cache.clearExpired();
        }, 1000 * 60 * 5);

        this.#startHealthCheck();
    }

    #connected = true;
    #checkInterval = null;

    #startHealthCheck() {
        this.#checkConnection();
        this.#checkInterval = setInterval(() => {
            this.#checkConnection();
        }, 15000);
    }

    async #checkConnection() {
        try {
            await fetch(`${this.gatewayUrl}/storage/stats`, {
                headers: this._headers(),
                signal: AbortSignal.timeout(5000),
            });
            if (!this.#connected) {
                this.#connected = true;
                if (this.onConnectionChange) {
                    this.onConnectionChange({ connected: true });
                }
            }
        } catch {
            if (this.#connected) {
                this.#connected = false;
                if (this.onConnectionChange) {
                    this.onConnectionChange({ connected: false });
                }
            }
        }
    }

    _headers() {
        const h = { 'Content-Type': 'application/json' };
        if (this.apiKey) {
            h['Authorization'] = `Bearer ${this.apiKey}`;
        }
        return h;
    }

    async _get(path, params = {}) {
        const url = new URL(path, this.gatewayUrl);
        Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
        });
        const res = await fetch(url.toString(), { headers: this._headers() });
        if (!res.ok) {
            throw new Error(`Gateway ${res.status}: ${res.statusText} ${url.toString()}`);
        }
        return res.json();
    }

    // ---- search ----

    async search({ q, type = 'song', limit = 50, offset = 0, sort = 'title' } = {}) {
        return this._get('/search', { q, type, limit, offset, sort });
    }

    async searchAll({ q, limit = 100 } = {}) {
        return this._get('/search', { q, type: 'all', limit });
    }

    // ---- browse ----

    async getAlbum(albumName, { limit, offset } = {}) {
        return this._get(`/browse/album/${encodeURIComponent(albumName)}`, { limit, offset });
    }

    async getArtist(artistName, { limit, offset } = {}) {
        return this._get(`/browse/artist/${encodeURIComponent(artistName)}`, { limit, offset });
    }

    async getLatest({ limit = 20, offset = 0 } = {}) {
        return this._get('/browse/latest', { limit, offset });
    }

    async getBrowseCategories() {
        return this._get('/recommendations');
    }

    async getCatalogStats() {
        return this._get('/storage/stats');
    }

    async getCatalogTracks({ limit = 500, offset = 0 } = {}) {
        return this._get('/catalog/tracks', { limit, offset });
    }

    async getCatalogAlbums({ limit = 500, offset = 0 } = {}) {
        return this._get('/catalog/albums', { limit, offset });
    }

    async getCatalogArtists({ limit = 500, offset = 0 } = {}) {
        return this._get('/catalog/artists', { limit, offset });
    }

    // ---- track / audio ----

    async getTrack(identifier) {
        return this._get(`/audio/metadata/${encodeURIComponent(identifier)}`);
    }

    async getTrackQuality(identifier) {
        return this._get(`/audio/metadata/${encodeURIComponent(identifier)}`);
    }

    async getStreamUrl(identifier) {
        return this._get(`/audio/${encodeURIComponent(identifier)}`);
    }

    // ---- no-op stubs (keep signatures for MusicAPI compatibility) ----

    async searchTracks() { return { items: [], limit: 0, offset: 0, totalNumberOfItems: 0 }; }
    async searchArtists() { return { items: [], limit: 0, offset: 0, totalNumberOfItems: 0 }; }
    async searchAlbums() { return { items: [], limit: 0, offset: 0, totalNumberOfItems: 0 }; }
    async searchPlaylists() { return { items: [], limit: 0, offset: 0, totalNumberOfItems: 0 }; }
    async searchVideos() { return { items: [], limit: 0, offset: 0, totalNumberOfItems: 0 }; }
    async getVideo() { return {}; }
    async getPlaylist() { return { playlist: {}, tracks: [] }; }
    async getMix() { return { mix: {}, tracks: [] }; }
    async getArtistBiography() { return null; }
    async getVideoStreamUrl() { return null; }
    async getArtistSocials() { return {}; }
    async getArtistBanner() { return null; }
    async downloadTrack() { throw new Error('Use GatewayAPI instead'); }
    async getTrackRecommendations() { return []; }
    async getSimilarArtists() { return []; }
    async getArtistTopTracks() { return { tracks: [], offset: 0, limit: 15, hasMore: false }; }
    async getSimilarAlbums() { return []; }
    async getRecommendedTracksForPlaylist() { return []; }
    async extractStreamUrlFromManifest() { return null; }

    // ---- cover art from gateway ----

    async getCoverArtUrl(songName) {
        if (!songName) return null;
        const cached = await this.cache.get('cover-art', { songName });
        if (cached) return cached;

        try {
            const result = await this._get(`/audio/cover-art/${encodeURIComponent(songName)}`);
            if (result?.success && result?.data) {
                const entry = {
                    url: result.data.cover_art_url || null,
                    album: result.data.album || null,
                    artist: result.data.artist || null,
                };
                await this.cache.set('cover-art', { songName }, entry);
                return entry;
            }
        } catch (e) {
            console.warn('Gateway cover art fetch failed:', e);
        }
        const empty = { url: null, album: null, artist: null };
        await this.cache.set('cover-art', { songName }, empty);
        return empty;
    }

    // ---- cover helpers ----

    getCoverUrl(id, size = '320') {
        if (typeof id === 'string' && id.startsWith('blob:')) return id;
        return `${this.gatewayUrl}/covers/${id}?size=${size}`;
    }

    getCoverSrcset(id) {
        if (typeof id === 'string' && id.startsWith('blob:')) return '';
        return `${this.getCoverUrl(id, '1280')} 1280w, ${this.getCoverUrl(id, '640')} 640w, ${this.getCoverUrl(id, '320')} 320w`;
    }

    getArtistPictureUrl(id, size = '320') {
        return `${this.gatewayUrl}/covers/artist/${id}?size=${size}`;
    }

    getArtistPictureSrcset(id) {
        return `${this.getArtistPictureUrl(id, '1280')} 1280w, ${this.getArtistPictureUrl(id, '320')} 320w`;
    }

    getVideoCoverUrl(id, size = '1280') {
        if (typeof id === 'string' && id.startsWith('blob:')) return id;
        return `${this.gatewayUrl}/covers/video/${id}?size=${size}`;
    }

    getProvider() {
        return 'gateway';
    }

    // ---- cache ----

    async clearCache() {
        await this.cache.clear();
    }

    getCacheStats() {
        return this.cache.getCacheStats();
    }
}
