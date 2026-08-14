import { expect, test, describe } from 'vitest';
import {
    normalizeCatalogTrack,
    normalizeCatalogAlbum,
    normalizeCatalogArtist,
    normalizeLatestResult,
} from '../gateway-api.js';

// Fixtures captured live from the gateway on 2026-08-13.
const track = {
    id: 'music/30% Off!/fef4564f0233637f6cd6dde80edda4f86fd42e1c3da06dfc4a89e3e05dbfe27d/transcode_0/30% Off!.flac',
    title: '30% Off!',
    artist: 'Best Frenz',
    album: '30% Off! (Now With 25% More!)',
    duration: 207.3798185941043,
    bitrate: 957718,
    format: 'flac',
    s3_key: 'music/30% Off!/fef4564f0233637f6cd6dde80edda4f86fd42e1c3da06dfc4a89e3e05dbfe27d/transcode_0/30% Off!.flac',
    cover_art_s3_key: 'music/30% Off!/fef4564f0233637f6cd6dde80edda4f86fd42e1c3da06dfc4a89e3e05dbfe27d/album.jpg',
};

const album = {
    id: '"Let\'s Rock"',
    title: '"Let\'s Rock"',
    artist: 'The Black Keys',
    cover_art_s3_key: 'music/LoHi/782afc09c8ebe7d8444a8eb8886a9dbad1dd66fbf283cfbd6b35ebe2f700359e/album.jpg',
    release_date: null,
    track_count: 1,
};

const artist = {
    id: 'Ajay-Atul',
    name: 'Ajay-Atul',
    genre: null,
    picture_s3_key: null,
    track_count: 1,
};

const latest = {
    type: 'song',
    id: 'music/505/060fe78d57d6caa04de977aa05f445cd059c13738d354c2d9fa30811ed9cd3f9/transcode_0/505.flac',
    title: '505',
    relevance_score: 1,
    snippet: 'Arctic Monkeys',
};

describe('gateway catalog normalization', () => {
    test('normalizeCatalogTrack maps flat fields to renderer shape', () => {
        const t = normalizeCatalogTrack(track);
        expect(t.id).toBe(track.id);
        expect(t.title).toBe('30% Off!');
        expect(t.artist).toEqual({ id: 'Best Frenz', name: 'Best Frenz' });
        expect(t.artists).toEqual([{ id: 'Best Frenz', name: 'Best Frenz' }]);
        expect(t.album).toEqual({ title: '30% Off! (Now With 25% More!)', cover: track.cover_art_s3_key });
        expect(t.duration).toBe(207.3798185941043);
        expect(t.type).toBe('track');
    });

    test('normalizeCatalogAlbum maps release_date/cover fields', () => {
        const a = normalizeCatalogAlbum(album);
        expect(a.id).toBe(album.id);
        expect(a.title).toBe('"Let\'s Rock"');
        expect(a.artist).toBe('The Black Keys');
        expect(a.cover).toBe(album.cover_art_s3_key);
        expect(a.releaseDate).toBeNull();
        expect(a.numberOfTracks).toBe(1);
        expect(a.type).toBe('album');
    });

    test('normalizeCatalogArtist maps picture_s3_key', () => {
        const a = normalizeCatalogArtist(artist);
        expect(a.id).toBe('Ajay-Atul');
        expect(a.name).toBe('Ajay-Atul');
        expect(a.picture).toBeNull();
        expect(a.type).toBe('artist');
    });

    test('normalizeLatestResult derives artist from snippet', () => {
        const r = normalizeLatestResult(latest);
        expect(r.id).toBe(latest.id);
        expect(r.title).toBe('505');
        expect(r.artist).toEqual({ id: 'Arctic Monkeys', name: 'Arctic Monkeys' });
        expect(r.artists).toEqual([{ id: 'Arctic Monkeys', name: 'Arctic Monkeys' }]);
        expect(r.type).toBe('track');
    });
});
