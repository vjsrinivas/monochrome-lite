// js/accounts/local-auth.js - Offline fallback auth (IndexedDB + Web Crypto)
// Mirrors AuthManager interface for seamless swap-in when PocketBase is unavailable

import { db } from '../db.js';

const DB_NAME = 'monochrome_local_auth';
const DB_VERSION = 1;
const STORE_NAME = 'local_accounts';
const SALT_LENGTH = 32;
const ITERATIONS = 100_000;
const HASH_LEN = 32;

function generateId() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function hashPassword(password, salt) {
    const encoder = new TextEncoder();
    const salted = new Uint8Array([...encoder.encode(password), ...salt]);
    const keyMaterial = await crypto.subtle.importKey('raw', salted, 'PBKDF2', false, ['deriveBits']);
    const derived = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: salt, iterations: ITERATIONS, hash: 'SHA-256' },
        keyMaterial,
        HASH_LEN * 8
    );
    return Array.from(new Uint8Array(derived), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function normalizeUser(record) {
    if (!record) return null;
    return {
        $id: record.id,
        email: record.email,
        username: record.username || record.email.split('@')[0],
        display_name: record.display_name || null,
        avatar_url: record.avatar_url || null,
        banner: record.banner || null,
        status: record.status || null,
        about: record.about || null,
        website: record.website || null,
        privacy: record.privacy || { playlists: 'public' },
        library: record.library || {},
        history: record.history || [],
        user_playlists: record.user_playlists || {},
        user_folders: record.user_folders || {},
        favorite_albums: record.favorite_albums || [],
        created: record.created || Date.now(),
    };
}

class LocalAuthManager {
    constructor() {
        this.user = null;
        this.authListeners = [];
        this._ready = false;
        this._init()
            .then(() => {
                this._ready = true;
            })
            .catch(() => {});
    }

    async _init() {
        try {
            const db = await openDB();
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAll();
            req.onsuccess = () => {
                const records = req.result || [];
                if (records.length > 0) {
                    const latest = records.reduce((a, b) => (a.created > b.created ? a : b));
                    normalizeUser(latest)
                        .then((u) => {
                            this.user = u;
                            this.authListeners.forEach((l) => l(u));
                            this.syncFoldersToDb();
                        })
                        .catch(() => {});
                }
            };
        } catch (e) {
            console.warn('[LocalAuth] Failed to init:', e);
        }
    }

    async _waitForReady() {
        if (this._ready) return;
        await new Promise((r) => {
            const check = () => {
                if (this._ready) r();
                else setTimeout(check, 50);
            };
            check();
        });
    }

    onAuthStateChanged(callback) {
        this.authListeners.push(callback);
        if (this.user !== null) {
            callback(this.user);
        }
    }

    async signIn(email, password) {
        await this._waitForReady();
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();

        return new Promise((resolve, reject) => {
            req.onsuccess = async () => {
                const records = req.result || [];
                const account = records.find((r) => r.email === email.toLowerCase());
                if (!account) {
                    reject(new Error('Account not found. Please sign up first.'));
                    return;
                }

                const hash = await hashPassword(
                    password,
                    Uint8Array.from(atob(account.salt), (c) => c.charCodeAt(0))
                );
                if (hash !== account.hash) {
                    reject(new Error('Incorrect password.'));
                    return;
                }

                this.user = await normalizeUser(account);
                this.authListeners.forEach((l) => l(this.user));
                resolve(this.user);
            };
            req.onerror = () => reject(req.error);
        });
    }

    async signUp(email, password, username) {
        await this._waitForReady();
        const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
        const hash = await hashPassword(password, salt);
        const id = generateId();

        const account = {
            id,
            email: email.toLowerCase(),
            username: username || email.split('@')[0],
            display_name: null,
            avatar_url: null,
            banner: null,
            status: null,
            about: null,
            website: null,
            privacy: { playlists: 'public' },
            library: {},
            history: [],
            user_playlists: {},
            user_folders: {},
            favorite_albums: [],
            created: Date.now(),
            hash,
            salt: btoa(String.fromCharCode(...salt)),
        };

        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        return new Promise((resolve, reject) => {
            const checkReq = store.get(email.toLowerCase());
            checkReq.onsuccess = () => {
                if (checkReq.result) {
                    reject(new Error('Account with this email already exists.'));
                    return;
                }

                const addReq = store.add(account);
                addReq.onsuccess = async () => {
                    this.user = await normalizeUser(account);
                    this.authListeners.forEach((l) => l(this.user));
                    resolve(this.user);
                };
                addReq.onerror = () => reject(addReq.error);
            };
            checkReq.onerror = () => reject(checkReq.error);
        });
    }

    async signOut() {
        this.user = null;
        this.authListeners.forEach((l) => l(null));
    }

    async updateProfile(data) {
        await this._waitForReady();
        if (!this.user) throw new Error('Not signed in');

        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        return new Promise((resolve, reject) => {
            const req = store.get(this.user.$id);
            req.onsuccess = () => {
                const record = req.result;
                if (!record) {
                    reject(new Error('Account not found'));
                    return;
                }

                if (data.display_name !== undefined) record.display_name = data.display_name;
                if (data.avatar_url !== undefined) record.avatar_url = data.avatar_url;
                if (data.banner !== undefined) record.banner = data.banner;
                if (data.status !== undefined) record.status = data.status;
                if (data.about !== undefined) record.about = data.about;
                if (data.website !== undefined) record.website = data.website;
                if (data.privacy !== undefined) record.privacy = data.privacy;
                if (data.library !== undefined) record.library = data.library;
                if (data.history !== undefined) record.history = data.history;
                if (data.user_playlists !== undefined) record.user_playlists = data.user_playlists;
                if (data.user_folders !== undefined) record.user_folders = data.user_folders;
                if (data.favorite_albums !== undefined) record.favorite_albums = data.favorite_albums;

                const updateReq = store.put(record);
                updateReq.onsuccess = async () => {
                    this.user = await normalizeUser(record);
                    this.authListeners.forEach((l) => l(this.user));
                    resolve(this.user);
                };
                updateReq.onerror = () => reject(updateReq.error);
            };
            req.onerror = () => reject(req.error);
        });
    }

    async getProfile(username) {
        await this._waitForReady();
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();

        return new Promise((resolve, reject) => {
            req.onsuccess = () => {
                const records = req.result || [];
                const account = records.find((r) => r.username === username);
                if (!account) {
                    resolve(null);
                    return;
                }
                normalizeUser(account)
                    .then((u) => resolve(u))
                    .catch(() => {});
            };
            req.onerror = () => reject(req.error);
        });
    }

    async isUsernameTaken(username) {
        await this._waitForReady();
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();

        return new Promise((resolve, reject) => {
            req.onsuccess = () => {
                const records = req.result || [];
                resolve(records.some((r) => r.username === username));
            };
            req.onerror = () => reject(req.error);
        });
    }

    async syncLibraryItem(_type, _item, _added) {
        if (!this.user) return;
        await this.updateProfile({ library: this.user.library });
    }

    async syncHistoryItem(historyEntry) {
        if (!this.user) return;
        const history = [historyEntry, ...(this.user.history || [])].slice(0, 100);
        await this.updateProfile({ history });
    }

    async clearHistory() {
        if (!this.user) return;
        await this.updateProfile({ history: [] });
    }

    async syncUserPlaylist(playlist, action) {
        if (!this.user) return;
        const userPlaylists = { ...(this.user.user_playlists || {}) };
        if (action === 'delete') {
            delete userPlaylists[playlist.id];
        } else {
            userPlaylists[playlist.id] = {
                id: playlist.id,
                name: playlist.name,
                cover: playlist.cover || null,
                tracks: playlist.tracks || [],
                createdAt: playlist.createdAt || Date.now(),
                updatedAt: playlist.updatedAt || Date.now(),
                numberOfTracks: playlist.tracks ? playlist.tracks.length : 0,
                images: playlist.images || [],
            };
        }
        await this.updateProfile({ user_playlists: userPlaylists });
    }

    async syncUserFolder(folder, action) {
        if (!this.user) return;
        const userFolders = { ...(this.user.user_folders || {}) };
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
        await this.updateProfile({ user_folders: userFolders });
    }

    async syncFoldersToDb() {
        const folders = Object.values(this.user.user_folders || {});
        if (folders.length === 0) return;
        for (const folder of folders) {
            try {
                const existing = await db.getFolder(folder.id);
                if (!existing) {
                    await db.createFolder(folder.name, folder.cover);
                }
                if (folder.playlists?.length) {
                    const updated = await db.getFolder(folder.id);
                    if (updated) {
                        for (const pid of folder.playlists) {
                            await db.addPlaylistToFolder(folder.id, pid);
                        }
                    }
                }
            } catch (e) {
                console.warn('[LocalAuth] Failed to sync folder to DB:', e);
            }
        }
    }

    async getUserData() {
        if (!this.user) return null;
        return {
            library: this.user.library || {},
            history: this.user.history || [],
            userPlaylists: this.user.user_playlists || {},
            userFolders: this.user.user_folders || {},
            profile: {
                username: this.user.username,
                display_name: this.user.display_name,
                avatar_url: this.user.avatar_url,
                banner: this.user.banner,
                status: this.user.status,
                about: this.user.about,
                website: this.user.website,
                privacy: this.user.privacy,
                favorite_albums: this.user.favorite_albums,
            },
        };
    }

    updateUI(user) {
        const connectBtn = document.getElementById('auth-connect-btn');
        const statusText = document.getElementById('auth-status');
        const emailContainer = document.getElementById('email-auth-container');
        const emailToggleBtn = document.getElementById('toggle-email-auth-btn');

        if (!connectBtn) return;

        if (user) {
            connectBtn.textContent = 'Sign Out';
            connectBtn.classList.add('danger');
            connectBtn.onclick = () => this.signOut();

            if (emailContainer) emailContainer.style.display = 'none';
            if (emailToggleBtn) emailToggleBtn.style.display = 'none';
            if (statusText) statusText.textContent = `Signed in as ${user.username || user.email}`;
        } else {
            connectBtn.textContent = 'Sign In';
            connectBtn.classList.remove('danger');
            connectBtn.onclick = () => {
                if (emailToggleBtn) {
                    const isVisible = emailContainer && emailContainer.style.display !== 'none';
                    emailContainer.style.display = isVisible ? 'none' : 'block';
                    emailToggleBtn.textContent = isVisible ? 'Sign in with Email' : 'Hide Email Sign In';
                }
            };

            if (emailToggleBtn) emailToggleBtn.style.display = 'inline-block';
            if (statusText) statusText.textContent = 'Sync your library across devices';
        }
    }
}

const localAuthManager = new LocalAuthManager();

export { localAuthManager };
