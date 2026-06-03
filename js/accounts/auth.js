// js/accounts/auth.js - PocketBase auth wrapper with local fallback
import { pb, checkHealth, getHealthStatus } from './pocketbase.js';
import { localAuthManager } from './local-auth.js';

function normalizeUser(user) {
    if (!user) return null;
    return { ...user, $id: user.id };
}

class AuthManager {
    constructor() {
        this.user = normalizeUser(pb.authStore.model);
        this.authListeners = [];
        this.mode = 'signin';
        this.isLoading = false;
        this._pbAvailable = false;
        this._checkConnectivity();
    }

    async _checkConnectivity() {
        try {
            const status = await checkHealth();
            this._pbAvailable = status === 'connected';
        } catch {
            this._pbAvailable = false;
        }
    }

    onAuthStateChanged(callback) {
        this.authListeners.push(callback);
        if (this.user !== null) {
            callback(this.user);
        }
    }

    async _tryPocketBase(fn) {
        if (this._pbAvailable) {
            try {
                return await fn();
            } catch (err) {
                console.warn('[Auth] PocketBase failed, falling back to local auth:', err.message);
                this._pbAvailable = false;
                throw err;
            }
        }
        throw new Error('PocketBase not available');
    }

    async signInWithEmail(email, password, onError) {
        this.isLoading = true;
        try {
            const authData = await this._tryPocketBase(() => pb.collection('users').authWithPassword(email, password));
            this.user = normalizeUser(authData.record);
            this.updateUI(this.user);
            this.authListeners.forEach((listener) => listener(this.user));
            return this.user;
        } catch (error) {
            try {
                const localUser = await localAuthManager.signIn(email, password);
                this.user = localUser;
                this._pbAvailable = false;
                this.updateUI(this.user);
                this.authListeners.forEach((listener) => listener(this.user));
                return this.user;
            } catch (localError) {
                const msg = error.message || localError.message || 'Authentication failed';
                console.error('Email Login failed:', msg);
                if (onError) onError(msg);
                throw error;
            }
        } finally {
            this.isLoading = false;
        }
    }

    async signUpWithEmail(email, password, username, onError) {
        this.isLoading = true;
        try {
            const data = {
                email,
                password,
                passwordConfirm: password,
                username,
                emailVisibility: true,
            };
            await this._tryPocketBase(() => pb.collection('users').create(data));
            await pb.collection('users').authWithPassword(email, password);
            this.user = normalizeUser(pb.authStore.model);
            this.updateUI(this.user);
            this.authListeners.forEach((listener) => listener(this.user));
            return this.user;
        } catch (error) {
            try {
                const localUser = await localAuthManager.signUp(email, password, username);
                this.user = localUser;
                this._pbAvailable = false;
                this.updateUI(this.user);
                this.authListeners.forEach((listener) => listener(this.user));
                return this.user;
            } catch (localError) {
                const msg = error.message || localError.message || 'Sign up failed';
                console.error('Sign Up failed:', msg);
                if (onError) onError(msg);
                throw error;
            }
        } finally {
            this.isLoading = false;
        }
    }

    async sendPasswordReset(email, onError) {
        try {
            await pb.collection('users').requestPasswordReset(email);
        } catch (error) {
            console.error('Password reset failed:', error);
            if (onError) onError(error.message || 'Failed to send reset email');
            throw error;
        }
    }

    async resetPassword(token, password, confirmPassword) {
        if (password !== confirmPassword) {
            throw new Error('Passwords do not match');
        }
        try {
            await pb.collection('users').confirmPasswordReset(token, password, confirmPassword);
        } catch (error) {
            console.error('Password reset failed:', error);
            throw error;
        }
    }

    async signInWithGoogle() {
        await this._oauthLogin('google');
    }

    async signInWithGitHub() {
        await this._oauthLogin('github');
    }

    async signInWithDiscord() {
        await this._oauthLogin('discord');
    }

    async signInWithSpotify() {
        await this._oauthLogin('spotify');
    }

    async _oauthLogin(provider) {
        try {
            const authData = await pb.collection('users').authWithOAuth2({ provider });
            this.user = normalizeUser(authData.record);
            this.updateUI(this.user);
            this.authListeners.forEach((listener) => listener(this.user));
        } catch (error) {
            console.error(`${provider} login failed:`, error);
        }
    }

    async signOut() {
        try {
            pb.authStore.clear();
            this.user = null;
            this.updateUI(null);
            this.authListeners.forEach((listener) => listener(null));
            window.location.reload();
        } catch (error) {
            console.error('Logout failed:', error);
            throw error;
        }
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
            if (statusText) statusText.textContent = `Signed in as ${user.email}`;
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

const authManager = new AuthManager();

pb.authStore.onChange((token, model) => {
    authManager.user = normalizeUser(model);
    authManager.updateUI(authManager.user);
    authManager.authListeners.forEach((listener) => listener(authManager.user));
}, true);

export { authManager };
