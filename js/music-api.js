// js/music-api.js

import { GatewayAPI } from './gateway-api.js';

/**
 * MusicAPI - Singleton class that provides a unified interface for accessing music audio sources.
 *
 * Primarily uses local Gateway streaming audio source.
 * Includes functionality for searching, retrieving metadata, streaming, and managing
 * playlists, artists, albums, tracks, and podcasts.
 *
 * @class MusicAPI
 * @classdesc Manages API interactions with audio sources and provides caching mechanisms
 * for cover artwork and video metadata.
 *
 * @example
 * // Initialize the MusicAPI
 * await MusicAPI.initialize(settings);
 *
 * // Get the singleton instance
 * const api = MusicAPI.instance;
 *
 * // Search for tracks
 * const results = await api.search('query');
 *
 * // Get a specific track
 * const track = await api.getTrack('track-id');
 *
 * // Get stream URL
 * const streamUrl = await api.getStreamUrl('track-id');
 *
 * @property {GatewayAPI} audioAPI - The audio source API instance (streaming)
 
 * @property {Object} _settings - Configuration settings
 * @property {Map} videoArtworkCache - Cache for video artwork data
 *
 * @throws {Error} Throws if instance is accessed before initialization
 * @throws {Error} Throws if initialize is called more than once
 */
export class MusicAPI {
    static #instance = null;
    /**
     * @type {MusicAPI}
     */
    static get instance() {
        if (!MusicAPI.#instance) {
            throw new Error('MusicAPI not initialized. Call MusicAPI.initialize(settings) first.');
        }
        return MusicAPI.#instance;
    }

    /** @private */
    constructor(settings = null) {
        // Use GatewayAPI as the primary (and only) API
        const gatewayUrl = (settings?.gatewayUrl || localStorage.getItem('gateway-url') || 'http://localhost:8080');
        const gatewayApiKey = settings?.gatewayApiKey || localStorage.getItem('gateway-api-key') || '';
        this.audioAPI = new GatewayAPI(gatewayUrl, gatewayApiKey);
        this._settings = settings;
        this.videoArtworkCache = new Map();
    }

    static async initialize(settings) {
        if (MusicAPI.#instance) {
            throw new Error('MusicAPI is already initialized');
        }

        const api = new MusicAPI(settings);
        return (MusicAPI.#instance = api);
    }

    static reinitialize(settings) {
        if (!MusicAPI.#instance) return;
        const gatewayUrl = (settings?.gatewayUrl || localStorage.getItem('gateway-url') || 'http://localhost:8080');
        const gatewayApiKey = settings?.gatewayApiKey || localStorage.getItem('gateway-api-key') || '';
        MusicAPI.#instance.audioAPI = new GatewayAPI(gatewayUrl, gatewayApiKey);
    }

    getCurrentProvider() {
        return this.audioAPI.getProvider();
    }

    getAPI() {
        return this.audioAPI;
    }

    // Search methods
    async search(query, options = {}) {
        const api = this.getAPI();
        if (typeof api.search === 'function') {
            return api.search(query, options);
        }

        // Fallback for providers that don't implement unified search
        const [tracksResult, videosResult, artistsResult, albumsResult, playlistsResult] = await Promise.all([
            api.searchTracks(query, options),
            api.searchVideos ? api.searchVideos(query, options) : Promise.resolve({ items: [] }),
            api.searchArtists(query, options),
            api.searchAlbums(query, options),
            api.searchPlaylists ? api.searchPlaylists(query, options) : Promise.resolve({ items: [] }),
        ]);

        return {
            tracks: tracksResult,
            videos: videosResult,
            artists: artistsResult,
            albums: albumsResult,
            playlists: playlistsResult,
        };
    }

    async searchTracks(query, options = {}) {
        return this.getAPI().searchTracks(query, options);
    }

    async searchArtists(query, options = {}) {
        return this.getAPI().searchArtists(query, options);
    }

    async searchAlbums(query, options = {}) {
        return this.getAPI().searchAlbums(query, options);
    }

    async searchPlaylists(query, options = {}) {
        return this.audioAPI.searchPlaylists(query, options);
    }

    async searchVideos(query, options = {}) {
        return this.audioAPI.searchVideos(query, options);
    }

    async searchPodcasts(query, options = {}) {
        return this.podcastsAPI.searchPodcasts(query, options);
    }

    async getPodcast(id, options = {}) {
        return this.podcastsAPI.getPodcastById(id, options);
    }

    async getPodcastEpisodes(id, options = {}) {
        return this.podcastsAPI.getPodcastEpisodes(id, options);
    }

    // Get methods
    async getTrack(id, quality) {
        return this.getAPI().getTrack(id, quality);
    }

    async getTrackMetadata(id) {
        const api = this.getAPI();
        if (typeof api.getTrackMetadata === 'function') {
            return api.getTrackMetadata(id);
        }
        return api.getTrack(id);
    }

    async getAlbum(id) {
        return this.getAPI().getAlbum(id);
    }

    async getArtist(id) {
        return this.getAPI().getArtist(id);
    }

    async getArtistBiography(id) {
        const api = this.getAPI();
        if (typeof api.getArtistBiography === 'function') {
            return api.getArtistBiography(id);
        }
        return null;
    }

    async getVideo(id) {
        const api = this.getAPI();
        if (typeof api.getVideo === 'function') {
            return api.getVideo(id);
        }
        return {};
    }

    async getVideoStreamUrl(id) {
        const api = this.getAPI();
        if (typeof api.getVideoStreamUrl === 'function') {
            return api.getVideoStreamUrl(id);
        }
    }

    async getArtistSocials(artistName) {
        return this.audioAPI.getArtistSocials(artistName);
    }

    async getPlaylist(id, _provider = null) {
        return this.audioAPI.getPlaylist(id);
    }

    async getMix(id) {
        return this.audioAPI.getMix(id);
    }

    async getTrackRecommendations(id) {
        const api = this.getAPI();
        if (typeof api.getTrackRecommendations === 'function') {
            return api.getTrackRecommendations(id);
        }
        return [];
    }

    // Stream methods
    async getStreamUrl(id, quality) {
        return this.getAPI().getStreamUrl(id, quality);
    }

    // Cover/artwork methods
    getCoverUrl(id, size = '320') {
        if (typeof id === 'string' && id.startsWith('blob:')) {
            return id;
        }
        return this.audioAPI.getCoverUrl(id, size);
    }

    getCoverSrcset(id) {
        if (typeof id === 'string' && id.startsWith('blob:')) {
            return '';
        }
        return this.audioAPI.getCoverSrcset(id);
    }

    getVideoCoverUrl(imageId, size = '1280') {
        if (!imageId) {
            return null;
        }
        if (typeof imageId === 'string' && imageId.startsWith('blob:')) {
            return imageId;
        }
        return this.audioAPI.getVideoCoverUrl(imageId, size);
    }

    async getVideoArtwork(title, artist) {
        const cacheKey = `${title}-${artist}`.toLowerCase();
        if (this.videoArtworkCache.has(cacheKey)) {
            return this.videoArtworkCache.get(cacheKey);
        }
        // artwork.boidu.dev developer asked us to disable his API for the time being due to rate limits.
        /* 
        try {
            const url = `https://artwork.boidu.dev/?s=${encodeURIComponent(title)}&a=${encodeURIComponent(artist)}`;
            const response = await fetch(url);
            if (!response.ok) return null;
            const data = await response.json();
            const result = {
                videoUrl: data.videoUrl || null,
                hlsUrl: data.animated || null,
            };
            this.videoArtworkCache.set(cacheKey, result);
            return result;
        
        } catch (error) {
            console.warn('Failed to fetch video artwork:', error);
            return null;
        }
        */
    }

    async getCoverArtUrl(songName) {
        return this.audioAPI.getCoverArtUrl(songName);
    }

    getArtistPictureUrl(id, size = '320') {
        return this.audioAPI.getArtistPictureUrl(id, size);
    }

    getArtistPictureSrcset(id) {
        return this.audioAPI.getArtistPictureSrcset(id);
    }

    async getArtistBanner(artistName) {
        const cacheKey = `banner-${artistName}`.toLowerCase();
        if (this.videoArtworkCache.has(cacheKey)) {
            return this.videoArtworkCache.get(cacheKey);
        }

        try {
            const url = `https://artwork-boidu-dev.samidy.workers.dev/artist?a=${encodeURIComponent(artistName)}`;
            const response = await fetch(url);
            if (!response.ok) return null;
            const data = await response.json();

            let hlsUrl = null;
            if (data.animated) {
                if (typeof data.animated === 'string') {
                    hlsUrl = data.animated;
                } else if (typeof data.animated === 'object') {
                    hlsUrl = data.animated.hls || data.animated.url || data.animated.hlsUrl || data.animated.videoUrl;

                    if (!hlsUrl) {
                        for (const key in data.animated) {
                            if (typeof data.animated[key] === 'string' && data.animated[key].includes('.m3u8')) {
                                hlsUrl = data.animated[key];
                                break;
}

                        }
                    }
                }
            }

            const result = {
                hlsUrl: hlsUrl,
            };
            this.videoArtworkCache.set(cacheKey, result);
            return result;
        } catch (error) {
            console.warn('Failed to fetch artist banner:', error);
            return null;
        }
    }

    extractStreamUrlFromManifest(manifest) {
        return this.audioAPI.extractStreamUrlFromManifest(manifest);
    }

    // Download methods
    async downloadTrack(id, quality, filename, options = {}) {
        return this.getAPI().downloadTrack(id, quality, filename, options);
    }

    // Similar/recommendation methods
    async getSimilarArtists(artistId) {
        return this.getAPI().getSimilarArtists(artistId);
    }

    async getArtistTopTracks(artistId, options = {}) {
        return this.audioAPI.getArtistTopTracks(artistId, options);
    }

    async getSimilarAlbums(albumId) {
        return this.getAPI().getSimilarAlbums(albumId);
    }

    async getRecommendedTracksForPlaylist(tracks, limit = 20, options = {}) {
        return this.audioAPI.getRecommendedTracksForPlaylist(tracks, limit, options);
    }

   // Catalog methods
    async getCatalogTracks({ limit = 500, offset = 0 } = {}) {
        return this.audioAPI.getCatalogTracks({ limit, offset });
    }

    async getCatalogAlbums({ limit = 500, offset = 0 } = {}) {
        return this.audioAPI.getCatalogAlbums({ limit, offset });
    }

    async getCatalogArtists({ limit = 500, offset = 0 } = {}) {
        return this.audioAPI.getCatalogArtists({ limit, offset });
    }

    // Cache methods
    async clearCache() {
        await this.audioAPI.clearCache();
    }

    getCacheStats() {
        return this.audioAPI.getCacheStats();
    }

    // Settings accessor for compatibility
    get settings() {
        return this._settings;
    }
}


