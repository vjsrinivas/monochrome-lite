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
    // Gateway /search always returns type:"song" hits regardless of the `type` param.
    // The `type` enum only controls which DB column is searched (title / album / artist).
    // We group the returned tracks into separate artists/albums sections by extracting
    // unique artist and album entries from the flat hit payload.

    #normalizeTrack(h) {
        const artistName = h.artist || 'Unknown Artist';
        const albumName = h.album || 'Unknown Album';
        const artistObj = { id: h.artist_id || artistName, name: artistName };
        const albumObj = { id: h.album_id || albumName, title: albumName, cover: h.cover_art_s3_key || null };
        return {
            id: h.id,
            title: h.title,
            type: 'track',
            artist: artistObj,
            artists: [artistObj],
            album: albumObj,
            cover: h.cover_art_s3_key || null,
            image: h.cover_art_s3_key || null,
            imageId: h.cover_art_s3_key || null,
            copyright: h.copyright || null,
            duration: h.duration || null,
        };
    }

    async search(q, { type = 'all', limit = 50, offset = 0 } = {}) {
        const res = await this._get('/search', { q, type, limit, offset });
        const hits = (res?.data?.results ?? []);
        const total = res?.data?.total ?? 0;

        const tracks = hits.map((h) => this.#normalizeTrack(h));

        const artistMap = new Map();
        const albumMap = new Map();
        for (const t of tracks) {
            if (!artistMap.has(t.artist.id)) {
                artistMap.set(t.artist.id, { id: t.artist.id, name: t.artist.name, type: 'artist' });
            }
            if (!albumMap.has(t.album.id)) {
                albumMap.set(t.album.id, { id: t.album.id, title: t.album.title, artist: t.artist.name, cover: t.album.cover, type: 'album' });
            }
        }

        return {
            tracks: { items: tracks, limit, offset, total },
            videos: { items: [], limit: 0, offset: 0, total: 0 },
            artists: { items: Array.from(artistMap.values()), limit: 0, offset: 0, total },
            albums: { items: Array.from(albumMap.values()), limit: 0, offset: 0, total },
            playlists: { items: [], limit: 0, offset: 0, total: 0 },
            podcasts: { items: [], limit: 0, offset: 0, total: 0 },
        };
    }

    async searchAll(q, { limit = 100 } = {}) {
        return this.search(q, { type: 'all', limit });
    }

    // ---- browse ----

    async getAlbum(albumName, { limit, offset } = {}) {
        const name = normalizeKey(albumName);
        const res = await this._get(`/catalog/albums/${encodeURIComponent(name)}/tracks`, { limit, offset });
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

    async getArtist(artistName, { limit = 500, offset = 0 } = {}) {
        const name = normalizeKey(artistName);
        const [tracksRes, artistsRes] = await Promise.all([
            this._get(`/catalog/artists/${encodeURIComponent(name)}/tracks`, { limit, offset }),
            this._get('/catalog/artists', { limit: 500 }),
        ]);

        const rawTracks = tracksRes?.data?.tracks ?? [];
        const tracks = rawTracks.map(normalizeCatalogTrack);

        const catalog = (artistsRes?.data?.artists ?? []).find(
            (a) => a.id === artistName || a.name === artistName
        );

        const albums = new Map();
        let fallbackArtist = '';
        for (const t of rawTracks) {
            fallbackArtist = t.artist || fallbackArtist;
            const key = t.album_id || t.album || t.title;
            if (albums.has(key)) continue;
            albums.set(key, {
                id: t.album_id || key,
                title: t.album || t.title,
                artist: catalog?.name || t.artist || 'Unknown Artist',
                cover: t.cover_art_s3_key || null,
                releaseDate: t.release_date || null,
                copyright: t.copyright || null,
                type: t.type || null,
                videoCoverUrl: t.video_cover_url || null,
            });
        }

        return {
            id: catalog?.id || artistName,
            name: catalog?.name || fallbackArtist || artistName,
            picture: catalog?.picture_s3_key || null,
            popularity: catalog?.track_count || 0,
            tracks,
            albums: Array.from(albums.values()),
            eps: [],
            videos: [],
            mixes: null,
            artistRoles: [],
        };
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
        const key = normalizeKey(identifier);
        const res = await this._get(`/audio/metadata/${encodeURIComponent(key)}`);
        return normalizeTrackDetail(res?.data);
    }

    async getTrackQuality(identifier) {
        const key = normalizeKey(identifier);
        const res = await this._get(`/audio/metadata/${encodeURIComponent(key)}`);
        return normalizeTrackDetail(res?.data);
    }

    async getStreamUrl(identifier) {
        const key = normalizeKey(identifier);
        const encoded = key.split('/').map(encodeURIComponent).join('/');
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

// Identifiers arrive either URL-encoded (from router pathname) or as raw
// catalog keys (from track.id). Normalize to the raw key before re-encoding.
export function normalizeKey(identifier) {
    try {
        return decodeURIComponent(identifier);
    } catch {
        return identifier; // already decoded (may contain literal %)
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

// Gateway /audio/metadata returns a flat AudioItem. Expand it into the UI track shape.
export function normalizeTrackDetail(t) {
    if (!t) return null;
    const artist = t.artist ? { id: t.artist, name: t.artist } : null;
    return {
        id: t.id,
        title: t.title,
        type: 'track',
        artist,
        artists: artist ? [artist] : [],
        album: t.album ? { id: t.album, title: t.album, cover: t.cover_art_s3_key || null } : null,
        cover: t.cover_art_s3_key || null,
        image: t.cover_art_s3_key || null,
        imageId: t.cover_art_s3_key || null,
        copyright: t.copyright || null,
        duration: t.duration,
        bitrate: t.bitrate,
        format: t.format,
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
