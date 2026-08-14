import { describe, expect, test } from 'vitest';
import { isServerError } from '../accounts/auth.js';

describe('isServerError', () => {
    test('a PocketBase HTTP error (404 missing collection) is a server error', () => {
        const err = { status: 404, message: 'Missing or invalid collection context.' };
        expect(isServerError(err)).toBe(true);
    });

    test('a connection failure (status 0) is not a server error', () => {
        const err = { status: 0, message: 'Failed to fetch' };
        expect(isServerError(err)).toBe(false);
    });

    test('a plain network error is not a server error', () => {
        expect(isServerError(new Error('ECONNREFUSED'))).toBe(false);
    });
});