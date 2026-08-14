// js/taglib.types.ts - Minimal types for taglib metadata (audio stack stripped)

export enum Mp4Stik {
    Normal = 1,
    MusicVideo = 6,
}

export interface TagLibMetadata {
    title?: string;
    artist?: string | string[];
    albumTitle?: string;
    albumArtist?: string;
    trackNumber?: number;
    discNumber?: number;
    totalTracks?: number;
    totalDiscs?: number;
    copyright?: string;
    isrc?: string;
    upc?: string;
    explicit?: boolean;
    stik?: number;
    bpm?: number;
    releaseDate?: string;
    cover?: { data: Uint8Array | number[]; type?: string };
    lyrics?: string;
    replayGain?: {
        albumReplayGain?: string;
        albumPeakAmplitude?: number;
        trackReplayGain?: string;
        trackPeakAmplitude?: number;
    };
    extra?: Record<string, string | undefined>;
    writeArtistsSeparately?: boolean;
}
