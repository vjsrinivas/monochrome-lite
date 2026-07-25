export class MusicDatabase {
    constructor() {
        this.dbName = 'MonochromeDB';
        this.version = 12;
        this.db = null;
    }

    async open() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = (event) => {
                console.error('Database error:', event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // v12 migration: only 'settings' store is used.
                // All other stores (favorites, history, playlists, folders, pinned) are now local-only (localStorage).
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings');
                }
            };
        });
    }

    // Generic Helper
    async performTransaction(storeName, mode, callback) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, mode);
            const store = transaction.objectStore(storeName);
            const request = callback(store);

            let result;
            if (request) {
                request.onsuccess = () => {
                    result = request.result;
                };
            }

            transaction.oncomplete = () => {
                resolve(result);
            };
            transaction.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    async getAll(storeName) {
        return this.performTransaction(storeName, 'readonly', (store) => store.getAll());
    }

    // History API — stubbed (local-only via localStorage)
    async addToHistory(track) {
        window.dispatchEvent(new CustomEvent('history-changed'));
        return Promise.resolve(null);
    }

    async getHistory() {
        return Promise.resolve([]);
    }

    async clearHistory() {
        return Promise.resolve();
    }

    // Favorites API — stubbed (local-only via localStorage)
    async toggleFavorite(type, item) {
        window.dispatchEvent(new CustomEvent('favorites-changed'));
        return Promise.resolve(false);
    }

    async isFavorite(type, id) {
        return Promise.resolve(false);
    }

    async getFavorites(type) {
        return Promise.resolve([]);
    }

    _minifyItem(type, item) {
        if (!item) return item;
        return { id: item.id, addedAt: item.addedAt || null };
    }

    _minifyPinnedItem(item, type) {
        if (!item) return null;
        const id = item.id || item.uuid;
        const nameMap = { album: 'title', artist: 'name', 'user-playlist': 'name' };
        return {
            id, type, name: item[nameMap[type]] || item.title || item.name || null,
            cover: item.cover || item.picture || item.image || null, href: null,
        };
    }

    // Pinned API — stubbed (local-only via localStorage)
    async togglePinned(item, type) {
        return Promise.resolve(false);
    }

    async isPinned(id) {
        return Promise.resolve(false);
    }

    async getPinned() {
        return Promise.resolve([]);
    }

    // Export/Import — stubbed
    async exportData() {
        return Promise.resolve({});
    }

    async importData(data, clear = false) {
        return Promise.resolve(false);
    }

    _updatePlaylistMetadata(playlist) {
        playlist.numberOfTracks = playlist.tracks ? playlist.tracks.length : 0;
        return playlist;
    }

    _dispatchPlaylistSync(action, playlist) {
        window.dispatchEvent(new CustomEvent('sync-playlist-change', { detail: { action, playlist } }));
    }

    // User Playlists API — stubbed (local-only via localStorage)
    async createPlaylist(name, tracks = [], cover = '', description = '') {
        const id = crypto.randomUUID();
        const playlist = { id, name, tracks: [], cover, description, createdAt: Date.now(), updatedAt: Date.now() };
        this._dispatchPlaylistSync('create', playlist);
        window.dispatchEvent(new CustomEvent('playlist-tracks-changed'));
        return Promise.resolve(playlist);
    }

    async addTrackToPlaylist(playlistId, track) {
        this._dispatchPlaylistSync('update', { id: playlistId });
        window.dispatchEvent(new CustomEvent('playlist-tracks-changed'));
        return Promise.resolve(null);
    }

    async addTracksToPlaylist(playlistId, tracks) {
        this._dispatchPlaylistSync('update', { id: playlistId });
        window.dispatchEvent(new CustomEvent('playlist-tracks-changed'));
        return Promise.resolve(null);
    }

    async removeTrackFromPlaylist(playlistId, trackId, trackType = null) {
        this._dispatchPlaylistSync('update', { id: playlistId });
        window.dispatchEvent(new CustomEvent('playlist-tracks-changed'));
        return Promise.resolve(null);
    }

    async deletePlaylist(playlistId) {
        this._dispatchPlaylistSync('delete', { id: playlistId });
        window.dispatchEvent(new CustomEvent('playlist-tracks-changed'));
        return Promise.resolve();
    }

    async getPlaylist(playlistId) {
        return Promise.resolve(null);
    }

    async updatePlaylist(playlist) {
        this._dispatchPlaylistSync('update', playlist);
        return Promise.resolve(playlist);
    }

    async addPlaylistToFolder(folderId, playlistId) {
        return Promise.resolve(null);
    }

    async getPlaylists(includeTracks = false) {
        return Promise.resolve([]);
    }

    async updatePlaylistName(playlistId, newName) {
        return Promise.resolve(null);
    }

    async updatePlaylistDescription(playlistId, newDescription) {
        this._dispatchPlaylistSync('update', { id: playlistId });
        return Promise.resolve(null);
    }

    async updatePlaylistTracks(playlistId, tracks) {
        return Promise.resolve(null);
    }

    // User Folders API — stubbed (local-only via localStorage)
    async createFolder(name, cover = '') {
        const id = crypto.randomUUID();
        return Promise.resolve({ id, name, cover, playlists: [], createdAt: Date.now(), updatedAt: Date.now() });
    }

    async getFolders() {
        return Promise.resolve([]);
    }

    async getFolder(id) {
        return Promise.resolve(null);
    }

    async deleteFolder(id) {
        return Promise.resolve();
    }

    // Settings API — active
    async saveSetting(key, value) {
        await this.performTransaction('settings', 'readwrite', (store) => store.put(value, key));
    }

    async getSetting(key) {
        return await this.performTransaction('settings', 'readonly', (store) => store.get(key));
    }
}

export const db = new MusicDatabase();
