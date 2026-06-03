//js/accounts/pocketbase.js
import PocketBase from 'pocketbase';
import { db } from '../db.js';

const DEFAULT_POCKETBASE_URL = 'http://localhost:8090';
const POCKETBASE_URL =
    window.__POCKETBASE_URL__ || localStorage.getItem('monochrome-pocketbase-url') || DEFAULT_POCKETBASE_URL;

console.log('[PocketBase] Using URL:', POCKETBASE_URL);

const pb = new PocketBase(POCKETBASE_URL);
pb.autoCancellation(false);

let _healthStatus = 'unknown';
let _healthCheckPromise = null;

async function checkHealth() {
    if (_healthCheckPromise) return _healthCheckPromise;
    _healthCheckPromise = (async () => {
        try {
            const resp = await fetch(POCKETBASE_URL + '/api/health', { method: 'GET', mode: 'cors' });
            if (resp.ok) {
                _healthStatus = 'connected';
            } else {
                _healthStatus = 'error';
            }
        } catch {
            _healthStatus = 'disconnected';
        }
        _healthCheckPromise = null;
        return _healthStatus;
    })();
    return _healthCheckPromise;
}

window.__pocketbaseHealth = {
    get status() {
        return _healthStatus;
    },
};

const syncManager = {
    pb: pb,
    _userRecordCache: null,
    _getUserRecordPromise: null,
    _isSyncing: false,

    async _getUserRecord(uid) {
        if (!uid) return null;

        if (this._userRecordCache && this._userRecordCache.id === uid) {
            return this._userRecordCache;
        }

        if (this._getUserRecordPromise && this._getUserRecordPromise.uid === uid) {
            return this._getUserRecordPromise.promise;
        }

        const promise = (async () => {
            try {
                const result = await this.pb.collection('DB_users').getList(1, 1, {
                    filter: `id="${uid}"`,
                    sort: '-username',
                });

                if (result.items.length > 0) {
                    const record = result.items[0];
                    this._userRecordCache = record;
                    return record;
                }

                try {
                    const newRecord = await this.pb.collection('DB_users').create({
                        id: uid,
                        library: {},
                        history: [],
                        user_playlists: {},
                        user_folders: {},
                    });
                    this._userRecordCache = newRecord;
                    return newRecord;
                } catch (createError) {
                    const retryResult = await this.pb.collection('DB_users').getList(1, 1, {
                        filter: `id="${uid}"`,
                    });
                    if (retryResult.items.length > 0) {
                        this._userRecordCache = retryResult.items[0];
                        return this._userRecordCache;
                    }
                    console.error('[PocketBase] Failed to create user:', createError);
                    return null;
                }
            } catch (error) {
                console.error('[PocketBase] Failed to get user:', error);
                return null;
            } finally {
                this._getUserRecordPromise = null;
            }
        })();

        this._getUserRecordPromise = { uid, promise };
        return promise;
    },

    async getUserData() {
        const user = pb.authStore.model;
        if (!user) return null;

        const record = await this._getUserRecord(user.id);
        if (!record) return null;

        const library = this.safeParseInternal(record.library, 'library', {});
        const history = this.safeParseInternal(record.history, 'history', []);
        const userPlaylists = this.safeParseInternal(record.user_playlists, 'user_playlists', {});
        const userFolders = this.safeParseInternal(record.user_folders, 'user_folders', {});
        const favoriteAlbums = this.safeParseInternal(record.favorite_albums, 'favorite_albums', []);

        const profile = {
            username: record.username,
            display_name: record.display_name,
            avatar_url: record.avatar_url,
            banner: record.banner,
            status: record.status,
            about: record.about,
            website: record.website,
            privacy: this.safeParseInternal(record.privacy, 'privacy', { playlists: 'public' }),
            favorite_albums: favoriteAlbums,
        };

        return { library, history, userPlaylists, userFolders, profile };
    },

    async _updateUserJSON(uid, field, data) {
        const record = await this._getUserRecord(uid);
        if (!record) {
            console.error('Cannot update: no user record found');
            return;
        }

        try {
            const stringifiedData = typeof data === 'string' ? data : JSON.stringify(data);
            const updated = await this.pb.collection('DB_users').update(record.id, { [field]: stringifiedData });
            this._userRecordCache = updated;
        } catch (error) {
            console.error(`Failed to sync ${field} to PocketBase:`, error);
        }
    },

    safeParseInternal(str, _fieldName, fallback) {
        if (!str) return fallback;
        if (typeof str !== 'string') return str;
        try {
            return JSON.parse(str);
        } catch {
            try {
                // Recovery attempt: replace illegal internal quotes in name/title fields
                const recovered = str.replace(/(:\s*")(.+?)("(?=\s*[,}\n\r]))/g, (_match, p1, p2, p3) => {
                    const escapedContent = p2.replace(/(?<!\\)"/g, '\\"');
                    return p1 + escapedContent + p3;
                });
                return JSON.parse(recovered);
            } catch {
                try {
                    // Python-style fallback (Single quotes, True/False, None)
                    // This handles data that was incorrectly serialized as Python repr string
                    if (str.includes("'") || str.includes('True') || str.includes('False')) {
                        const jsFriendly = str
                            .replace(/\bTrue\b/g, 'true')
                            .replace(/\bFalse\b/g, 'false')
                            .replace(/\bNone\b/g, 'null');

                        // Basic safety check: ensure it looks like a structure and doesn't contain obvious code vectors
                        if (
                            (jsFriendly.trim().startsWith('[') || jsFriendly.trim().startsWith('{')) &&
                            !jsFriendly.match(/function|=>|window|document|alert|eval/)
                        ) {
                            // TODO: maybe this could be parsed as json5?
                            // eslint-disable-next-line @typescript-eslint/no-implied-eval
                            return new Function('return ' + jsFriendly)();
                        }
                    }
                } catch (error) {
                    console.log(error); // Ignore fallback error
                }
                return fallback;
            }
        }
    },

    async syncLibraryItem(type, item, added) {
        const user = pb.authStore.model;
        if (!user) return;

        const record = await this._getUserRecord(user.id);
        if (!record) return;

        let library = this.safeParseInternal(record.library, 'library', {});

        const pluralType = type === 'mix' ? 'mixes' : `${type}s`;
        const key = type === 'playlist' ? item.uuid : item.id;

        if (!library[pluralType]) {
            library[pluralType] = {};
        }

        if (added) {
            library[pluralType][key] = this._minifyItem(type, item);
        } else {
            delete library[pluralType][key];
        }

        await this._updateUserJSON(user.$id, 'library', library);
    },

    _minifyItem(type, item) {
        if (!item) return item;

        const base = {
            id: item.id,
            addedAt: item.addedAt || Date.now(),
        };

        if (type === 'track') {
            return {
                ...base,
                title: item.title || null,
                duration: item.duration || null,
                explicit: item.explicit || false,
                artist: item.artist || (item.artists && item.artists.length > 0 ? item.artists[0] : null) || null,
                artists: item.artists?.map((a) => ({ id: a.id, name: a.name || null })) || [],
                album: item.album
                    ? {
                          id: item.album.id,
                          title: item.album.title || null,
                          cover: item.album.cover || null,
                          releaseDate: item.album.releaseDate || null,
                          vibrantColor: item.album.vibrantColor || null,
                          artist: item.album.artist || null,
                          numberOfTracks: item.album.numberOfTracks || null,
                      }
                    : null,
                copyright: item.copyright || null,
                isrc: item.isrc || null,
                trackNumber: item.trackNumber || null,
                streamStartDate: item.streamStartDate || null,
                version: item.version || null,
                mixes: item.mixes || null,
                isPodcast: item.isPodcast || (item.id && String(item.id).startsWith('podcast_')) || null,
                enclosureUrl: item.enclosureUrl || null,
                enclosureType: item.enclosureType || null,
                enclosureLength: item.enclosureLength || null,
            };
        }

        if (type === 'video') {
            return {
                ...base,
                type: 'video',
                title: item.title || null,
                duration: item.duration || null,
                image: item.image || item.cover || null,
                artist: item.artist || (item.artists && item.artists.length > 0 ? item.artists[0] : null) || null,
                artists: item.artists?.map((a) => ({ id: a.id, name: a.name || null })) || [],
                album: item.album || { title: 'Video', cover: item.image || item.cover },
            };
        }

        if (type === 'album') {
            return {
                ...base,
                title: item.title || null,
                cover: item.cover || null,
                releaseDate: item.releaseDate || null,
                explicit: item.explicit || false,
                artist: item.artist
                    ? { name: item.artist.name || null, id: item.artist.id }
                    : item.artists?.[0]
                      ? { name: item.artists[0].name || null, id: item.artists[0].id }
                      : null,
                type: item.type || null,
                numberOfTracks: item.numberOfTracks || null,
            };
        }

        if (type === 'artist') {
            return {
                ...base,
                name: item.name || null,
                picture: item.picture || item.image || null,
            };
        }

        if (type === 'playlist') {
            return {
                uuid: item.uuid || item.id,
                addedAt: item.addedAt || Date.now(),
                title: item.title || item.name || null,
                image: item.image || item.squareImage || item.cover || null,
                numberOfTracks: item.numberOfTracks || (item.tracks ? item.tracks.length : 0),
                user: item.user ? { name: item.user.name || null } : null,
            };
        }

        if (type === 'mix') {
            return {
                id: item.id,
                addedAt: item.addedAt || Date.now(),
                title: item.title,
                subTitle: item.subTitle,
                mixType: item.mixType,
                cover: item.cover,
            };
        }

        return item;
    },

    async syncHistoryItem(historyEntry) {
        const user = pb.authStore.model;
        if (!user) return;

        const record = await this._getUserRecord(user.id);
        if (!record) return;

        let history = this.safeParseInternal(record.history, 'history', []);

        const newHistory = [historyEntry, ...history].slice(0, 100);
        await this._updateUserJSON(user.$id, 'history', newHistory);
    },

    async clearHistory() {
        const user = pb.authStore.model;
        if (!user) return;

        await this._updateUserJSON(user.id, 'history', []);
    },

    async syncUserPlaylist(playlist, action) {
        const user = pb.authStore.model;
        if (!user) return;

        const record = await this._getUserRecord(user.id);
        if (!record) return;

        let userPlaylists = this.safeParseInternal(record.user_playlists, 'user_playlists', {});

        if (action === 'delete') {
            delete userPlaylists[playlist.id];
        } else {
            userPlaylists[playlist.id] = {
                id: playlist.id,
                name: playlist.name,
                cover: playlist.cover || null,
                tracks: playlist.tracks ? playlist.tracks.map((t) => this._minifyItem(t.type || 'track', t)) : [],
                createdAt: playlist.createdAt || Date.now(),
                updatedAt: playlist.updatedAt || Date.now(),
                numberOfTracks: playlist.tracks ? playlist.tracks.length : 0,
                images: playlist.images || [],
            };
        }

        await this._updateUserJSON(user.$id, 'user_playlists', userPlaylists);
    },

    async syncUserFolder(folder, action) {
        const user = pb.authStore.model;
        if (!user) return;

        const record = await this._getUserRecord(user.id);
        if (!record) return;

        let userFolders = this.safeParseInternal(record.user_folders, 'user_folders', {});

        if (action === 'delete') {
            delete userFolders[folder.id];
        } else {
            userFolders[folder.id] = {
                id: folder.id,
                name: folder.name,
                cover: folder.cover || null,
                playlists: folder.playlists || [],
                createdAt: folder.createdAt || Date.now(),
                updatedAt: folder.updatedAt || Date.now(),
            };
        }

        await this._updateUserJSON(user.$id, 'user_folders', userFolders);
    },

    async getProfile(username) {
        try {
            const record = await this.pb.collection('DB_users').getFirstListItem(`username="${username}"`, {
                fields: 'username,display_name,avatar_url,banner,status,about,website,privacy,user_playlists,favorite_albums',
            });
            return {
                ...record,
                privacy: this.safeParseInternal(record.privacy, 'privacy', { playlists: 'public' }),
                user_playlists: this.safeParseInternal(record.user_playlists, 'user_playlists', {}),
                favorite_albums: this.safeParseInternal(record.favorite_albums, 'favorite_albums', []),
            };
        } catch {
            return null;
        }
    },

    async updateProfile(data) {
        const user = pb.authStore.model;
        if (!user) return;
        const record = await this._getUserRecord(user.id);
        if (!record) return;

        const updateData = { ...data };

        const updated = await this.pb.collection('DB_users').update(record.id, updateData, { f_id: user.id });
        this._userRecordCache = updated;
    },

    async isUsernameTaken(username) {
        try {
            const list = await this.pb.collection('DB_users').getList(1, 1, { filter: `username="${username}"` });
            return list.totalItems > 0;
        } catch {
            return false;
        }
    },

    async onAuthStateChanged(user) {
        if (user) {
            if (this._isSyncing) return;

            this._isSyncing = true;

            try {
                const cloudData = await this.getUserData();

                if (cloudData) {
                    let database = db;

                    const localData = {
                        tracks: (await database.getAll('favorites_tracks')) || [],
                        albums: (await database.getAll('favorites_albums')) || [],
                        artists: (await database.getAll('favorites_artists')) || [],
                        playlists: (await database.getAll('favorites_playlists')) || [],
                        mixes: (await database.getAll('favorites_mixes')) || [],
                        history: (await database.getAll('history_tracks')) || [],
                        userPlaylists: (await database.getAll('user_playlists')) || [],
                        userFolders: (await database.getAll('user_folders')) || [],
                    };

                    let { library, history, userPlaylists, userFolders } = cloudData;
                    let needsUpdate = false;

                    if (!library) library = {};
                    if (!library.tracks) library.tracks = {};
                    if (!library.albums) library.albums = {};
                    if (!library.artists) library.artists = {};
                    if (!library.playlists) library.playlists = {};
                    if (!library.mixes) library.mixes = {};
                    if (!userPlaylists) userPlaylists = {};
                    if (!userFolders) userFolders = {};
                    if (!history) history = [];

                    const mergeItem = (collection, item, type) => {
                        const id = type === 'playlist' ? item.uuid || item.id : item.id;
                        if (!collection[id]) {
                            collection[id] = this._minifyItem(type, item);
                            needsUpdate = true;
                        }
                    };

                    localData.tracks.forEach((item) => mergeItem(library.tracks, item, 'track'));
                    localData.albums.forEach((item) => mergeItem(library.albums, item, 'album'));
                    localData.artists.forEach((item) => mergeItem(library.artists, item, 'artist'));
                    localData.playlists.forEach((item) => mergeItem(library.playlists, item, 'playlist'));
                    localData.mixes.forEach((item) => mergeItem(library.mixes, item, 'mix'));

                    localData.userPlaylists.forEach((playlist) => {
                        if (!userPlaylists[playlist.id]) {
                            userPlaylists[playlist.id] = {
                                id: playlist.id,
                                name: playlist.name,
                                cover: playlist.cover || null,
                                tracks: playlist.tracks
                                    ? playlist.tracks.map((t) => this._minifyItem(t.type || 'track', t))
                                    : [],
                                createdAt: playlist.createdAt || Date.now(),
                                updatedAt: playlist.updatedAt || Date.now(),
                                numberOfTracks: playlist.tracks ? playlist.tracks.length : 0,
                                images: playlist.images || [],
                            };
                            needsUpdate = true;
                        }
                    });

                    localData.userFolders.forEach((folder) => {
                        if (!userFolders[folder.id]) {
                            userFolders[folder.id] = {
                                id: folder.id,
                                name: folder.name,
                                cover: folder.cover || null,
                                playlists: folder.playlists || [],
                                createdAt: folder.createdAt || Date.now(),
                                updatedAt: folder.updatedAt || Date.now(),
                            };
                            needsUpdate = true;
                        }
                    });

                    const combinedHistory = [...history, ...localData.history];
                    combinedHistory.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

                    const uniqueHistory = [];
                    const seenTimestamps = new Set();

                    for (const item of combinedHistory) {
                        if (!item.timestamp) continue;
                        if (!seenTimestamps.has(item.timestamp)) {
                            seenTimestamps.add(item.timestamp);
                            uniqueHistory.push(item);
                        }
                        if (uniqueHistory.length >= 100) break;
                    }

                    if (JSON.stringify(history) !== JSON.stringify(uniqueHistory)) {
                        history = uniqueHistory;
                        needsUpdate = true;
                    }

                    if (needsUpdate) {
                        await this._updateUserJSON(user.$id, 'library', library);
                        await this._updateUserJSON(user.$id, 'user_playlists', userPlaylists);
                        await this._updateUserJSON(user.$id, 'user_folders', userFolders);
                        await this._updateUserJSON(user.$id, 'history', history);
                    }

                    const convertedData = {
                        favorites_tracks: Object.values(library.tracks).filter((t) => t && typeof t === 'object'),
                        favorites_albums: Object.values(library.albums).filter((a) => a && typeof a === 'object'),
                        favorites_artists: Object.values(library.artists).filter((a) => a && typeof a === 'object'),
                        favorites_playlists: Object.values(library.playlists).filter((p) => p && typeof p === 'object'),
                        favorites_mixes: Object.values(library.mixes).filter((m) => m && typeof m === 'object'),
                        history_tracks: history,
                        user_playlists: Object.values(userPlaylists).filter((p) => p && typeof p === 'object'),
                        user_folders: Object.values(userFolders).filter((f) => f && typeof f === 'object'),
                    };

                    // Safety check: if we had local data but merged result is completely empty, something went wrong.
                    // Do NOT call importData as it would wipe the user's local stores.
                    const hadLocalData =
                        localData.tracks.length > 0 ||
                        localData.albums.length > 0 ||
                        localData.artists.length > 0 ||
                        localData.playlists.length > 0 ||
                        localData.mixes.length > 0 ||
                        localData.history.length > 0 ||
                        localData.userPlaylists.length > 0 ||
                        localData.userFolders.length > 0;

                    const isConvertedEmpty =
                        convertedData.favorites_tracks.length === 0 &&
                        convertedData.favorites_albums.length === 0 &&
                        convertedData.favorites_artists.length === 0 &&
                        convertedData.favorites_playlists.length === 0 &&
                        convertedData.favorites_mixes.length === 0 &&
                        convertedData.history_tracks.length === 0 &&
                        convertedData.user_playlists.length === 0 &&
                        convertedData.user_folders.length === 0;

                    if (hadLocalData && isConvertedEmpty) {
                        console.warn(
                            '[PocketBase] Sync aborted: local data exists but merged result is empty. Preserving local data to prevent accidental wipe.'
                        );
                    } else {
                        await database.importData(convertedData, true);
                    }
                    await new Promise((resolve) => setTimeout(resolve, 300));

                    window.dispatchEvent(new CustomEvent('library-changed'));
                    window.dispatchEvent(new CustomEvent('history-changed'));
                    window.dispatchEvent(new HashChangeEvent('hashchange'));

                    console.log('[PocketBase] ✓ Sync completed');
                }
            } catch (error) {
                console.error('[PocketBase] Sync error:', error);
            } finally {
                this._isSyncing = false;
            }
        } else {
            this._userRecordCache = null;
            this._isSyncing = false;
        }
    },
};

pb.authStore.onChange((token, model) => {
    syncManager.onAuthStateChanged(model);
}, true);

export { pb, syncManager, checkHealth, getHealthStatus };

function getHealthStatus() {
    return _healthStatus;
}
