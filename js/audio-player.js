// js/audio-player.js
// QualitySwitcher — handles switching between opus and flac qualities
// with preloading to avoid playback gaps.

import { MusicAPI } from './music-api.js';

export class QualitySwitcher {
    constructor(api) {
        this.api = api;
        this.currentQuality = 'opus'; // opus | flac
        this.targetQuality = 'opus';
        this._preloaded = new Map(); // trackId -> { url, quality }
        this._abortController = null;
    }

    getCurrentQuality() {
        return this.currentQuality;
    }

    setTargetQuality(quality) {
        this.targetQuality = quality;
    }

    async getAvailableQualities(trackId) {
        const cache = this._preloaded.get(trackId);
        if (cache) return { [cache.quality]: true };

        try {
            const quality = await this.api.getTrackQuality(trackId);
            const available = {};
            if (quality?.opus) available.opus = true;
            if (quality?.flac) available.flac = true;
            if (!available.opus && !available.flac) {
                // Assume both if metadata doesn't explicitly say
                available.opus = true;
                available.flac = true;
            }
            return available;
        } catch {
            return { opus: true, flac: true };
        }
    }

    async preloadQuality(trackId, quality) {
        // Abort any in-flight preload for this track
        if (this._abortController) {
            this._abortController.abort();
        }
        this._abortController = new AbortController();

        try {
            const streamUrl = await this.api.getStreamUrl(trackId, quality);
            if (this._abortController.signal.aborted) return;
            this._preloaded.set(trackId, { url: streamUrl, quality });
        } catch (e) {
            if (e.name !== 'AbortError') {
                console.debug('[QualitySwitcher] Preload failed for', trackId, e.message);
            }
        }
    }

    async switchTo(trackId, targetQuality) {
        this.targetQuality = targetQuality;

        // If already playing, wait for track end then switch
        // (handled by checking targetQuality on next track load)
        // If not playing, use targetQuality immediately
        if (targetQuality !== this.currentQuality) {
            await this.preloadQuality(trackId, targetQuality);
            this.currentQuality = targetQuality;
        }
    }

    getStreamUrlForTrack(trackId) {
        const preloaded = this._preloaded.get(trackId);
        if (preloaded && preloaded.quality === this.targetQuality) {
            return preloaded.url;
        }
        // Fall back to current quality
        const fallback = this._preloaded.get(trackId);
        if (fallback) return fallback.url;
        return null;
    }

    clearTrack(trackId) {
        this._preloaded.delete(trackId);
    }

    clearAll() {
        this._preloaded.clear();
        if (this._abortController) {
            this._abortController.abort();
            this._abortController = null;
        }
    }
}
