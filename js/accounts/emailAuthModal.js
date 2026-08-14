// js/accounts/emailAuthModal.js - Wire up the email auth modal
import { authManager } from './auth.js';
import { SVG_EYE, SVG_EYE_OFF } from '../icons.js';

const MODAL = 'email-auth-modal';
const CLOSE_BTN = 'email-auth-modal-close';
const SUBMIT_BTN = 'email-auth-submit-btn';
const MODE_SIGNIN = 'auth-mode-signin';
const MODE_SIGNUP = 'auth-mode-signup';
const USERNAME_FIELD = 'auth-username-field';
const CONFIRM_FIELD = 'auth-password-confirm-field';
const CONFIRM_INPUT = 'auth-password-confirm';
const USERNAME_INPUT = 'auth-username';
const USERNAME_STATUS = 'auth-username-status';
const ERROR_EL = 'auth-error';
const RESET_BTN = 'reset-password-btn';
const EMAIL_INPUT = 'auth-email';
const PASSWORD_INPUT = 'auth-password';
const PASSWORD_TOGGLE = 'email-auth-password-toggle';
const EYE_ICON = 'email-auth-eye-icon';

let isSignUp = false;

function getEl(id) {
    return document.getElementById(id);
}

function showMode(signup) {
    isSignUp = signup;
    const signinBtn = getEl(MODE_SIGNIN);
    const signupBtn = getEl(MODE_SIGNUP);
    if (signinBtn) signinBtn.classList.toggle('active', !signup);
    if (signupBtn) signupBtn.classList.toggle('active', signup);
    if (getEl(USERNAME_FIELD)) getEl(USERNAME_FIELD).style.display = signup ? 'block' : 'none';
    if (getEl(CONFIRM_FIELD)) getEl(CONFIRM_FIELD).style.display = signup ? 'block' : 'none';
    const submitBtn = getEl(SUBMIT_BTN);
    if (submitBtn) submitBtn.textContent = signup ? 'Sign Up →' : 'Login →';
}

function showError(msg) {
    const el = getEl(ERROR_EL);
    if (el) {
        el.textContent = msg;
        el.style.display = 'block';
    }
}

function clearError() {
    const el = getEl(ERROR_EL);
    if (el) {
        el.textContent = '';
        el.style.display = 'none';
    }
}

let passwordVisible = false;

function updatePasswordToggleIcon(showPassword) {
    const iconEl = getEl(EYE_ICON);
    if (iconEl) {
        iconEl.innerHTML = showPassword ? SVG_EYE(20) : SVG_EYE_OFF(20);
    }
}

function togglePasswordVisibility() {
    const passwordInput = getEl(PASSWORD_INPUT);
    const toggleBtn = getEl(PASSWORD_TOGGLE);
    if (!passwordInput || !toggleBtn) return;
    passwordVisible = !passwordVisible;
    passwordInput.type = passwordVisible ? 'text' : 'password';
    updatePasswordToggleIcon(passwordVisible);
}

function openModal() {
    const modal = getEl(MODAL);
    if (modal) modal.classList.add('active');
}

function closeModal() {
    const modal = getEl(MODAL);
    if (modal) modal.classList.remove('active');
}

function submitAuth() {
    const email = getEl(EMAIL_INPUT)?.value.trim();
    const password = getEl(PASSWORD_INPUT)?.value;
    const errorEl = getEl(ERROR_EL);
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
    }
    if (!email || !email.includes('@')) {
        showError('Please enter a valid email.');
        return;
    }
    if (!password || password.length < 6) {
        showError('Password must be at least 6 characters.');
        return;
    }
    if (isSignUp) {
        const username = getEl(USERNAME_INPUT)?.value.trim();
        const confirm = getEl(CONFIRM_INPUT)?.value;
        if (!username) {
            showError('Username is required.');
            return;
        }
        if (password !== confirm) {
            showError('Passwords do not match.');
            return;
        }
    }
    const btn = getEl(SUBMIT_BTN);
    if (btn) {
        btn.disabled = true;
        btn.textContent = isSignUp ? 'Signing Up…' : 'Signing In…';
    }
    if (isSignUp) {
        const username = getEl(USERNAME_INPUT)?.value.trim();
        authManager.signUpWithEmail(email, password, username, (msg) => {
            showError(msg || 'Sign up failed.');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Sign Up →';
            }
        }).then(() => {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Sign Up →';
            }
            // Clear inputs
            getEl(EMAIL_INPUT).value = '';
            getEl(PASSWORD_INPUT).value = '';
            getEl(USERNAME_INPUT).value = '';
            getEl(CONFIRM_INPUT).value = '';
            showMode(false);
            closeModal();
        }).catch(() => {
            // Error already handled by onError callback
        });
    } else {
        authManager.signInWithEmail(email, password, (msg) => {
            showError(msg || 'Sign in failed.');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Login →';
            }
        }).then(() => {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Login →';
            }
            getEl(EMAIL_INPUT).value = '';
            getEl(PASSWORD_INPUT).value = '';
            showMode(false);
            closeModal();
        }).catch(() => {
            // Error already handled by onError callback
        });
    }
}

function resetPassword() {
    const email = getEl(EMAIL_INPUT)?.value.trim();
    if (!email) {
        showError('Enter your email first, then click Forgot password.');
        return;
    }
    const btn = getEl(RESET_BTN);
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Sending…';
    }
    authManager.sendPasswordReset(email, (msg) => {
        showError(msg || 'Failed to send reset email.');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Forgot password?';
        }
    }).then(() => {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Check your email!';
        }
    }).catch(() => {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Forgot password?';
        }
    });
}

export function initEmailAuthModal() {
    const closeBtn = getEl(CLOSE_BTN);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    const modal = getEl(MODAL);
    if (modal) {
        const overlay = modal.querySelector('.modal-overlay');
        if (overlay) overlay.addEventListener('click', closeModal);
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal?.classList.contains('active')) {
            closeModal();
        }
    });

    const signinBtn = getEl(MODE_SIGNIN);
    if (signinBtn) signinBtn.addEventListener('click', () => showMode(false));
    const signupBtn = getEl(MODE_SIGNUP);
    if (signupBtn) signupBtn.addEventListener('click', () => showMode(true));

    const submitBtn = getEl(SUBMIT_BTN);
    if (submitBtn) submitBtn.addEventListener('click', submitAuth);

    const resetBtn = getEl(RESET_BTN);
    if (resetBtn) resetBtn.addEventListener('click', resetPassword);

    const passwordToggle = getEl(PASSWORD_TOGGLE);
    if (passwordToggle) passwordToggle.addEventListener('click', togglePasswordVisibility);

    // Wire account page buttons
    const connectBtn = getEl('auth-connect-btn');
    const toggleBtn = getEl('toggle-email-auth-btn');
    if (connectBtn) {
        connectBtn.addEventListener('click', () => {
            if (authManager.user) {
                authManager.signOut();
            } else {
                openModal();
            }
        });
    }
    if (toggleBtn) {
        toggleBtn.addEventListener('click', openModal);
    }
}

export { openModal as openEmailAuthModal, closeModal };
