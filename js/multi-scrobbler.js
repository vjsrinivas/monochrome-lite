import { ListenBrainzScrobbler } from './listenbrainz.js';
import { MalojaScrobbler } from './maloja.js';

export class MultiScrobbler {
    constructor() {
        this.listenbrainz = new ListenBrainzScrobbler();
        this.maloja = new MalojaScrobbler();
    }

    isAuthenticated() {
        return this.listenbrainz.isEnabled() || this.maloja.isEnabled();
    }

    async updateNowPlaying(track) {
        await Promise.allSettled(
            [this.listenbrainz.updateNowPlaying(track), this.maloja.updateNowPlaying(track)].map((p) =>
                p.catch(console.error)
            )
        );
    }

    async onTrackChange(track) {
        await Promise.allSettled(
            [this.listenbrainz.onTrackChange(track), this.maloja.onTrackChange(track)].map((p) =>
                p.catch(console.error)
            )
        );
    }

    onPlaybackStop() {
        this.listenbrainz.onPlaybackStop();
        this.maloja.onPlaybackStop();
    }

    async loveTrack(track) {
        await Promise.allSettled([this.listenbrainz.loveTrack(track)].map((p) => p.catch(console.error)));
    }
}
