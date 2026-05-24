// js/accounts/auth.js - PocketBase auth wrapper
import { pb } from './pocketbase.js';

function normalizeUser(user) {
    if (!user) return null;
    return { ...user, $id: user.id };
}

class AuthManager {
    constructor() {
        this.user = normalizeUser(pb.authStore.model);
        this.authListeners = [];
    }

    onAuthStateChanged(callback) {
        this.authListeners.push(callback);
        if (this.user !== null) {
            callback(this.user);
        }
    }

    async signInWithEmail(email, password) {
        try {
            const authData = await pb.collection('users').authWithPassword(email, password);
            this.user = normalizeUser(authData.record);
            this.updateUI(this.user);
            this.authListeners.forEach((listener) => listener(this.user));
            return this.user;
        } catch (error) {
            console.error('Email Login failed:', error);
            alert(`Login failed: ${error.message}`);
            throw error;
        }
    }

    async signUpWithEmail(email, password) {
        try {
            const data = {
                email,
                password,
                passwordConfirm: password,
                emailVisibility: true,
            };
            await pb.collection('users').create(data);
            await pb.collection('users').authWithPassword(email, password);
            this.user = normalizeUser(pb.authStore.model);
            this.updateUI(this.user);
            this.authListeners.forEach((listener) => listener(this.user));
            return this.user;
        } catch (error) {
            console.error('Sign Up failed:', error);
            alert(`Sign Up failed: ${error.message}`);
            throw error;
        }
    }

    async sendPasswordReset(email) {
        try {
            await pb.collection('users').requestPasswordReset(email);
            alert(`Password reset email sent to ${email}`);
        } catch (error) {
            console.error('Password reset failed:', error);
            alert(`Failed to send reset email: ${error.message}`);
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
