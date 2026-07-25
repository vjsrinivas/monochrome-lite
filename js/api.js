// js/api.js — LosslessAPI is a no-op stub; gateway handles all API work.
// ponytail: kept as a drop-in replacement so imports don't break.

export const DASH_MANIFEST_UNAVAILABLE_CODE = 'DASH_MANIFEST_UNAVAILABLE';
export { resolveDownloadTotalBytes } from './downloadProgressUtils.js';

export class LosslessAPI {
    constructor() {
        throw new Error('LosslessAPI is removed — use GatewayAPI instead');
    }
    // Stub signatures so callers that enumerate methods don't crash.
    static fetchWithRetry() { throw new Error('Use GatewayAPI instead'); }
    static search() { throw new Error('Use GatewayAPI instead'); }
    static searchTracks() { throw new Error('Use GatewayAPI instead'); }
    static searchAlbums() { throw new Error('Use GatewayAPI instead'); }
    static searchArtists() { throw new Error('Use GatewayAPI instead'); }
    static searchPlaylists() { throw new Error('Use GatewayAPI instead'); }
    static searchVideos() { throw new Error('Use GatewayAPI instead'); }
    static getAlbum() { throw new Error('Use GatewayAPI instead'); }
    static getArtist() { throw new Error('Use GatewayAPI instead'); }
    static getTrack() { throw new Error('Use GatewayAPI instead'); }
    static getStreamUrl() { throw new Error('Use GatewayAPI instead'); }
    static getPlaylist() { throw new Error('Use GatewayAPI instead'); }
    static getMix() { throw new Error('Use GatewayAPI instead'); }
    static getVideo() { throw new Error('Use GatewayAPI instead'); }
    static downloadTrack() { throw new Error('Use GatewayAPI instead'); }
    static getTrackRecommendations() { throw new Error('Use GatewayAPI instead'); }
    static getSimilarArtists() { throw new Error('Use GatewayAPI instead'); }
    static getArtistTopTracks() { throw new Error('Use GatewayAPI instead'); }
    static getSimilarAlbums() { throw new Error('Use GatewayAPI instead'); }
    static getRecommendedTracksForPlaylist() { throw new Error('Use GatewayAPI instead'); }
    static getArtistBiography() { throw new Error('Use GatewayAPI instead'); }
    static getVideoStreamUrl() { throw new Error('Use GatewayAPI instead'); }
    static getArtistSocials() { throw new Error('Use GatewayAPI instead'); }
    static getArtistBanner() { throw new Error('Use GatewayAPI instead'); }
    static extractStreamUrlFromManifest() { throw new Error('Use GatewayAPI instead'); }
    static clearCache() { throw new Error('Use GatewayAPI instead'); }
    static getCacheStats() { throw new Error('Use GatewayAPI instead'); }
}
