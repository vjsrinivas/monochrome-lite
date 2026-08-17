// js/gateway-api.js
import { APICache } from './cache.js';

export class GatewayAPI {
    constructor(gatewayUrl, apiKey) {
        this.gatewayUrl = (gatewayUrl || '').replace(/\/+$/, '');
        this.apiKey = apiKey || '';
        this.cache = new APICache({
            maxSize: 200,
            ttl: 1000 * 30,
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
            await fetch(`${this.gatewayUrl}/health`, {
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
            h['X-Api-Key'] = this.apiKey;
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

    async _getStream(path, params = {}) {
        const url = new URL(path, this.gatewayUrl);
        Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
        });
        const res = await fetch(url.toString(), { headers: this._headers() });
        if (!res.ok) {
            throw new Error(`Gateway ${res.status}: ${res.statusText} ${url.toString()}`);
        }
        return res;
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
        const res = await this._get(`/catalog/albums/${encodeURIComponent(albumName)}/tracks`, { limit, offset });
        const tracks = (res?.data?.tracks ?? []).map(t => ({
            ...t,
            artists: t.artists?.length ? t.artists : t.artist ? [{ id: t.artist_id || t.artist, name: t.artist }] : [],
        }));
        if (tracks.length === 0) return { album: null, tracks: [] };
        const t = tracks[0];
        return {
            tracks,
            album: {
                id: t.album_id || albumName,
                title: t.album || albumName,
                cover: t.cover_art_s3_key || null,
                artist: t.artist_id
                    ? { id: t.artist_id, name: t.artist || '' }
                    : { id: null, name: t.artist || '' },
                releaseDate: t.release_date || null,
                copyright: t.copyright || null,
                explicit: t.explicit || false,
                type: t.type || null,
                videoCoverUrl: t.video_cover_url || null,
            },
        };
    }

    async getArtist(artistName, { limit, offset } = {}) {
        return this._get(`/browse/artist/${encodeURIComponent(artistName)}`, { limit, offset });
    }

    async getLatest({ limit = 20, offset = 0 } = {}) {
        const cached = await this.cache.get('latest', { limit, offset });
        if (cached) return cached;

        const res = await this._get('/browse/latest', { limit, offset });
        const result = { tracks: (res?.data?.results ?? []).map(normalizeLatestResult), total: res?.data?.total };
        await this.cache.set('latest', { limit, offset }, result);
        return result;
    }

    async getBrowseCategories() {
        return this._get('/recommendations');
    }

    async getCatalogStats() {
        return this._get('/storage/stats');
    }

    async getCatalogTracks({ limit = 500, offset = 0 } = {}) {
        const cached = await this.cache.get('catalog-tracks', { limit, offset });
        if (cached) return cached;

        const res = await this._get('/catalog/tracks', { limit, offset });
        const result = { tracks: (res?.data?.tracks ?? []).map(normalizeCatalogTrack), total: res?.data?.total };
        await this.cache.set('catalog-tracks', { limit, offset }, result);
        return result;
    }

    async getCatalogAlbums({ limit = 500, offset = 0 } = {}) {
        const cached = await this.cache.get('catalog-albums', { limit, offset });
        if (cached) return cached;

        const res = await this._get('/catalog/albums', { limit, offset });
        const result = { albums: (res?.data?.albums ?? []).map(normalizeCatalogAlbum), total: res?.data?.total };
        await this.cache.set('catalog-albums', { limit, offset }, result);
        return result;
    }

    async getCatalogArtists({ limit = 500, offset = 0 } = {}) {
        const cached = await this.cache.get('catalog-artists', { limit, offset });
        if (cached) return cached;

        const res = await this._get('/catalog/artists', { limit, offset });
        const result = { artists: (res?.data?.artists ?? []).map(normalizeCatalogArtist), total: res?.data?.total };
        await this.cache.set('catalog-artists', { limit, offset }, result);
        return result;
    }

    // ---- track / audio ----

    async getTrack(identifier) {
        return this._get(`/audio/metadata/${encodeURIComponent(identifier)}`);
    }

    async getTrackQuality(identifier) {
        return this._get(`/audio/metadata/${encodeURIComponent(identifier)}`);
    }

    async getStreamUrl(identifier) {
        const encoded = identifier.split('/').map(encodeURIComponent).join('/');
        let url = `${this.gatewayUrl}/audio/${encoded}`;
        if (this.apiKey) {
            url += `?api_key=${encodeURIComponent(this.apiKey)}`;
        }
        return { url };
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

    getSongCoverUrl(songName) {
        if (!songName) return null;
        return `${this.gatewayUrl}/covers/song/${encodeURIComponent(songName)}`;
    }

    async getCoverArtUrl(songName) {
        if (!songName) return null;
        const cached = await this.cache.get('cover-art', { songName });
        if (cached) return cached;

        const entry = { url: this.getSongCoverUrl(songName), album: null, artist: null };
        await this.cache.set('cover-art', { songName }, entry);
        return entry;
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
        if (typeof id === 'string' && id.startsWith('blob:')) return id;
        return `${this.gatewayUrl}/covers/${id}?size=${size}`;
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

// ---- shape mapping: gateway catalog rows -> UI renderer shapes ----

export function normalizeCatalogTrack(t) {
    return {
        id: t.id,
        title: t.title,
        artist: t.artist ? { id: t.artist, name: t.artist } : null,
        artists: t.artist ? [{ id: t.artist, name: t.artist }] : [],
        album: t.album ? { title: t.album, cover: t.cover_art_s3_key || null } : { cover: t.cover_art_s3_key || null },
        cover: t.cover_art_s3_key || null,
        duration: t.duration,
        type: 'track',
    };
}

export function normalizeCatalogAlbum(a) {
    return {
        id: a.id,
        title: a.title,
        artist: a.artist || 'Unknown Artist',
        cover: a.cover_art_s3_key || null,
        releaseDate: a.release_date || null,
        numberOfTracks: a.track_count || null,
        type: 'album',
    };
}

export function normalizeCatalogArtist(a) {
    return {
        id: a.id,
        name: a.name,
        picture: a.picture_s3_key || null,
        type: 'artist',
    };
}

export function normalizeLatestResult(r) {
    const artist = r.snippet ? { id: r.snippet, name: r.snippet } : null;
    return {
        id: r.id,
        title: r.title,
        artist,
        artists: artist ? [artist] : [],
        album: null,
        cover: null,
        duration: null,
        type: 'track',
    };
}
