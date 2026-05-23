import { expect, test, describe, vi, beforeEach, afterEach } from 'vitest';
import { nasSettings } from '../storage.js';
import { LosslessAPI } from '../api.js';

// Create a mock settings object for the API
function createMockSettings() {
    return {
        getInstances: vi.fn().mockResolvedValue([]),
    };
}

// Helper to create a mock response
function mockResponse(ok, status = 200, body = null, headers = {}) {
    return {
        ok,
        status,
        headers: new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(body ? JSON.stringify(body) : ''),
    };
}

describe('NAS Streaming Pipeline', () => {
    let api;
    let mockSettings;
    let originalFetch;

    beforeEach(() => {
        mockSettings = createMockSettings();
        api = new LosslessAPI(mockSettings);
        vi.clearAllMocks();
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        nasSettings.reset();
        globalThis.fetch = originalFetch;
    });

    describe('getNasStreamUrl', () => {
        test('returns null when NAS is disabled', async () => {
            nasSettings.setEnabled(false);

            const result = await api.getNasStreamUrl({ id: '12345', isrc: 'ISRC12345678' }, 'LOSSLESS');
            expect(result).toBeNull();
        });

        test('returns null when NAS base URL is empty', async () => {
            nasSettings.setEnabled(true);
            nasSettings.setBaseUrl('');
            nasSettings.setMappingStrategy('ISRC');

            const result = await api.getNasStreamUrl({ id: '12345', isrc: 'ISRC12345678' }, 'LOSSLESS');
            expect(result).toBeNull();
        });

        test('returns null when track has no ISRC and strategy is ISRC', async () => {
            nasSettings.setEnabled(true);
            nasSettings.setBaseUrl('http://localhost:9876');
            nasSettings.setMappingStrategy('ISRC');

            const result = await api.getNasStreamUrl({ id: '12345' }, 'LOSSLESS');
            expect(result).toBeNull();
        });

        test('returns null when track has no TIDAL ID and strategy is TIDAL_ID', async () => {
            nasSettings.setEnabled(true);
            nasSettings.setBaseUrl('http://localhost:9876');
            nasSettings.setMappingStrategy('TIDAL_ID');

            const result = await api.getNasStreamUrl({ isrc: 'ISRC12345678' }, 'LOSSLESS');
            expect(result).toBeNull();
        });

        test('returns null when HEAD request fails (404)', async () => {
            nasSettings.setEnabled(true);
            nasSettings.setBaseUrl('http://localhost:9876');
            nasSettings.setMappingStrategy('ISRC');

            globalThis.fetch = vi.fn().mockImplementation(async (url, options = {}) => {
                const urlString = typeof url === 'string' ? url : url.toString();
                if (options.method === 'HEAD' && urlString.includes('/music/')) {
                    return mockResponse(false, 404);
                }
                return mockResponse(false, 404);
            });

            const result = await api.getNasStreamUrl({ id: '12345', isrc: 'NONEXISTENT' }, 'LOSSLESS');
            expect(result).toBeNull();
        });

        test('returns NAS stream URL when file exists (ISRC strategy)', async () => {
            nasSettings.setEnabled(true);
            nasSettings.setBaseUrl('http://localhost:9876');
            nasSettings.setMappingStrategy('ISRC');

            globalThis.fetch = vi.fn().mockImplementation(async (url, options = {}) => {
                const urlString = typeof url === 'string' ? url : url.toString();
                if (options.method === 'HEAD' && urlString.includes('/music/ISRC12345678.flac')) {
                    return mockResponse(true, 200, null, {
                        'Content-Length': '1000',
                        'Content-Type': 'audio/flac',
                    });
                }
                return mockResponse(false, 404);
            });

            const result = await api.getNasStreamUrl({ id: '12345', isrc: 'ISRC12345678' }, 'LOSSLESS');
            expect(result).not.toBeNull();
            expect(result.url).toContain('http://localhost:9876/music/ISRC12345678.flac');
            expect(result.source).toBe('nas');
        });

        test('returns NAS stream URL when file exists (TIDAL_ID strategy)', async () => {
            nasSettings.setEnabled(true);
            nasSettings.setBaseUrl('http://localhost:9876');
            nasSettings.setMappingStrategy('TIDAL_ID');

            globalThis.fetch = vi.fn().mockImplementation(async (url, options = {}) => {
                const urlString = typeof url === 'string' ? url : url.toString();
                if (options.method === 'HEAD' && urlString.includes('/music/12345678.flac')) {
                    return mockResponse(true, 200, null, {
                        'Content-Length': '1000',
                        'Content-Type': 'audio/flac',
                    });
                }
                return mockResponse(false, 404);
            });

            const result = await api.getNasStreamUrl({ id: '12345678', isrc: 'ISRC12345678' }, 'LOSSLESS');
            expect(result).not.toBeNull();
            expect(result.url).toContain('http://localhost:9876/music/12345678.flac');
            expect(result.source).toBe('nas');
        });

        test('uses correct extension for HI_RES_LOSSLESS quality', async () => {
            nasSettings.setEnabled(true);
            nasSettings.setBaseUrl('http://localhost:9876');
            nasSettings.setMappingStrategy('ISRC');

            globalThis.fetch = vi.fn().mockImplementation(async (url, options = {}) => {
                const urlString = typeof url === 'string' ? url : url.toString();
                if (options.method === 'HEAD' && urlString.includes('/music/ISRC12345678.flac')) {
                    return mockResponse(true, 200, null, { 'Content-Length': '1000' });
                }
                return mockResponse(false, 404);
            });

            const result = await api.getNasStreamUrl({ id: '12345', isrc: 'ISRC12345678' }, 'HI_RES_LOSSLESS');
            expect(result.url).toContain('.flac');
        });

        test('uses correct extension for LOSSLESS quality', async () => {
            nasSettings.setEnabled(true);
            nasSettings.setBaseUrl('http://localhost:9876');
            nasSettings.setMappingStrategy('ISRC');

            globalThis.fetch = vi.fn().mockImplementation(async (url, options = {}) => {
                const urlString = typeof url === 'string' ? url : url.toString();
                if (options.method === 'HEAD' && urlString.includes('/music/ISRC12345678.flac')) {
                    return mockResponse(true, 200, null, { 'Content-Length': '1000' });
                }
                return mockResponse(false, 404);
            });

            const result = await api.getNasStreamUrl({ id: '12345', isrc: 'ISRC12345678' }, 'LOSSLESS');
            expect(result.url).toContain('.flac');
        });

        test('uses mp3 extension for non-lossless quality', async () => {
            nasSettings.setEnabled(true);
            nasSettings.setBaseUrl('http://localhost:9876');
            nasSettings.setMappingStrategy('ISRC');

            globalThis.fetch = vi.fn().mockImplementation(async (url, options = {}) => {
                const urlString = typeof url === 'string' ? url : url.toString();
                if (options.method === 'HEAD' && urlString.includes('/music/ISRC12345678.mp3')) {
                    return mockResponse(true, 200, null, { 'Content-Length': '500' });
                }
                return mockResponse(false, 404);
            });

            const result = await api.getNasStreamUrl({ id: '12345', isrc: 'ISRC12345678' }, 'HIGH');
            expect(result.url).toContain('.mp3');
        });

        test('uses mp3 extension for LOW quality', async () => {
            nasSettings.setEnabled(true);
            nasSettings.setBaseUrl('http://localhost:9876');
            nasSettings.setMappingStrategy('ISRC');

            globalThis.fetch = vi.fn().mockImplementation(async (url, options = {}) => {
                const urlString = typeof url === 'string' ? url : url.toString();
                if (options.method === 'HEAD' && urlString.includes('/music/ISRC12345678.mp3')) {
                    return mockResponse(true, 200, null, { 'Content-Length': '500' });
                }
                return mockResponse(false, 404);
            });

            const result = await api.getNasStreamUrl({ id: '12345', isrc: 'ISRC12345678' }, 'LOW');
            expect(result.url).toContain('.mp3');
        });

        test('respects CUSTOM_API strategy', async () => {
            nasSettings.setEnabled(true);
            nasSettings.setBaseUrl('http://localhost:9876');
            nasSettings.setMappingStrategy('CUSTOM_API');
            nasSettings.setApiUrl('http://localhost:9876');

            globalThis.fetch = vi.fn().mockImplementation(async (url, options = {}) => {
                const urlString = typeof url === 'string' ? url : url.toString();
                if (urlString.includes('/resolve?')) {
                    return mockResponse(true, 200, { path: '/music/12345678.flac' });
                }
                if (options.method === 'HEAD' && urlString.includes('/music/12345678.flac')) {
                    return mockResponse(true, 200, null, { 'Content-Length': '1000' });
                }
                return mockResponse(false, 404);
            });

            const result = await api.getNasStreamUrl({ id: '12345678', isrc: 'ISRC12345678' }, 'LOSSLESS');
            expect(result).not.toBeNull();
            expect(result.url).toContain('http://localhost:9876/music/12345678.flac');
        });

        test('returns null when CUSTOM_API endpoint is unreachable', async () => {
            nasSettings.setEnabled(true);
            nasSettings.setBaseUrl('http://localhost:9876');
            nasSettings.setMappingStrategy('CUSTOM_API');
            nasSettings.setApiUrl('http://localhost:1');

            const result = await api.getNasStreamUrl({ id: '12345', isrc: 'ISRC12345678' }, 'LOSSLESS');
            expect(result).toBeNull();
        });

        test('returns rgInfo as null for NAS streams', async () => {
            nasSettings.setEnabled(true);
            nasSettings.setBaseUrl('http://localhost:9876');
            nasSettings.setMappingStrategy('ISRC');

            globalThis.fetch = vi.fn().mockImplementation(async (url, options = {}) => {
                const urlString = typeof url === 'string' ? url : url.toString();
                if (options.method === 'HEAD' && urlString.includes('/music/ISRC12345678.flac')) {
                    return mockResponse(true, 200, null, { 'Content-Length': '1000' });
                }
                return mockResponse(false, 404);
            });

            const result = await api.getNasStreamUrl({ id: '12345', isrc: 'ISRC12345678' }, 'LOSSLESS');
            expect(result.rgInfo).toBeNull();
        });
    });

    describe('getStreamUrl - NAS First with Fallback', () => {
        test('returns NAS stream when NAS is enabled and file exists', async () => {
            nasSettings.setEnabled(true);
            nasSettings.setBaseUrl('http://localhost:9876');
            nasSettings.setMappingStrategy('ISRC');

            globalThis.fetch = vi.fn().mockImplementation(async (url, options = {}) => {
                const urlString = typeof url === 'string' ? url : url.toString();
                if (options.method === 'HEAD' && urlString.includes('/music/ISRC12345678.flac')) {
                    return mockResponse(true, 200, null, { 'Content-Length': '1000' });
                }
                if (urlString.includes('/info/?id=12345')) {
                    return mockResponse(true, 200, {
                        data: {
                            id: 12345,
                            title: 'Test Track',
                            duration: 180,
                            audioQuality: 'LOSSLESS',
                            isrc: 'ISRC12345678',
                            album: { id: 123, title: 'Test Album' },
                            artists: [{ id: 1, name: 'Test Artist' }],
                        },
                    });
                }
                return mockResponse(false, 404);
            });

            const result = await api.getStreamUrl('12345', 'LOSSLESS');
            expect(result.url).toContain('http://localhost:9876/music/ISRC12345678.flac');
            expect(result.source).toBe('nas');
        });

        test('throws when NAS file not found', async () => {
            nasSettings.setEnabled(true);
            nasSettings.setBaseUrl('http://localhost:9876');
            nasSettings.setMappingStrategy('ISRC');

            globalThis.fetch = vi.fn().mockImplementation(async (url, options = {}) => {
                const urlString = typeof url === 'string' ? url : url.toString();
                if (options.method === 'HEAD' && urlString.includes('/music/')) {
                    return mockResponse(false, 404);
                }
                if (urlString.includes('/info/?id=99999')) {
                    return mockResponse(true, 200, {
                        data: {
                            id: 99999,
                            title: 'Test Track',
                            duration: 180,
                            audioQuality: 'LOSSLESS',
                            isrc: 'ISRC99999999',
                            album: { id: 123, title: 'Test Album' },
                            artists: [{ id: 1, name: 'Test Artist' }],
                        },
                    });
                }
                return mockResponse(false, 404);
            });

            await expect(api.getStreamUrl('99999', 'LOSSLESS')).rejects.toThrow(/Could not resolve stream URL/);
        });

        test('throws when NAS is disabled', async () => {
            nasSettings.setEnabled(false);

            globalThis.fetch = vi.fn().mockImplementation(async (url, options = {}) => {
                const urlString = typeof url === 'string' ? url : url.toString();
                if (urlString.includes('/info/?id=12345')) {
                    return mockResponse(true, 200, {
                        data: {
                            id: 12345,
                            title: 'Test Track',
                            duration: 180,
                            audioQuality: 'LOSSLESS',
                            isrc: 'ISRC12345678',
                            album: { id: 123, title: 'Test Album' },
                            artists: [{ id: 1, name: 'Test Artist' }],
                        },
                    });
                }
                return mockResponse(false, 404);
            });

            await expect(api.getStreamUrl('12345', 'LOSSLESS')).rejects.toThrow(/Could not resolve stream URL/);
        });

        test('caches stream results', async () => {
            nasSettings.setEnabled(true);
            nasSettings.setBaseUrl('http://localhost:9876');
            nasSettings.setMappingStrategy('ISRC');

            globalThis.fetch = vi.fn().mockImplementation(async (url, options = {}) => {
                const urlString = typeof url === 'string' ? url : url.toString();
                if (options.method === 'HEAD' && urlString.includes('/music/ISRC12345678.flac')) {
                    return mockResponse(true, 200, null, { 'Content-Length': '1000' });
                }
                if (urlString.includes('/info/?id=12345')) {
                    return mockResponse(true, 200, {
                        data: {
                            id: 12345,
                            title: 'Test Track',
                            duration: 180,
                            audioQuality: 'LOSSLESS',
                            isrc: 'ISRC12345678',
                            album: { id: 123, title: 'Test Album' },
                            artists: [{ id: 1, name: 'Test Artist' }],
                        },
                    });
                }
                return mockResponse(false, 404);
            });

            const result1 = await api.getStreamUrl('12345', 'LOSSLESS');
            const result2 = await api.getStreamUrl('12345', 'LOSSLESS');

            expect(result1.url).toBe(result2.url);
            expect(result1.source).toBe(result2.source);
        });

        test('returns different results for different qualities', async () => {
            nasSettings.setEnabled(true);
            nasSettings.setBaseUrl('http://localhost:9876');
            nasSettings.setMappingStrategy('ISRC');

            globalThis.fetch = vi.fn().mockImplementation(async (url, options = {}) => {
                const urlString = typeof url === 'string' ? url : url.toString();
                if (options.method === 'HEAD' && urlString.includes('/music/ISRC12345678.flac')) {
                    return mockResponse(true, 200, null, { 'Content-Length': '1000' });
                }
                if (options.method === 'HEAD' && urlString.includes('/music/ISRC12345678.mp3')) {
                    return mockResponse(true, 200, null, { 'Content-Length': '500' });
                }
                if (urlString.includes('/info/?id=12345')) {
                    return mockResponse(true, 200, {
                        data: {
                            id: 12345,
                            title: 'Test Track',
                            duration: 180,
                            audioQuality: 'LOSSLESS',
                            isrc: 'ISRC12345678',
                            album: { id: 123, title: 'Test Album' },
                            artists: [{ id: 1, name: 'Test Artist' }],
                        },
                    });
                }
                return mockResponse(false, 404);
            });

            const resultLossless = await api.getStreamUrl('12345', 'LOSSLESS');
            const resultHigh = await api.getStreamUrl('12345', 'HIGH');

            // Both should succeed
            expect(resultLossless).not.toBeNull();
            expect(resultHigh).not.toBeNull();
            // LOSSLESS uses .flac, HIGH uses .mp3
            expect(resultLossless.url).toContain('.flac');
            expect(resultHigh.url).toContain('.mp3');
        });
    });

    describe('nasSettings - Fallback to Stream', () => {
        test('fallback is always disabled', () => {
            nasSettings.reset();
            expect(nasSettings.getFallbackToStream()).toBe(false);
        });

        test('fallback setting is always false regardless of stored value', () => {
            nasSettings.setFallbackToStream(true);
            expect(nasSettings.getFallbackToStream()).toBe(false);
        });

        test('default nasFallbackToStream is false', () => {
            nasSettings.reset();
            const all = nasSettings._getAll();
            expect(all.nasFallbackToStream).toBe(false);
        });
    });

    describe('Path Mapping Strategies', () => {
        test('ISRC strategy generates correct path format', async () => {
            nasSettings.setEnabled(true);
            nasSettings.setBaseUrl('http://localhost:9876');
            nasSettings.setMappingStrategy('ISRC');

            globalThis.fetch = vi.fn().mockImplementation(async (url, options = {}) => {
                const urlString = typeof url === 'string' ? url : url.toString();
                if (options.method === 'HEAD' && urlString.includes('/music/US-S1Z-21-00001.flac')) {
                    return mockResponse(true, 200, null, { 'Content-Length': '1000' });
                }
                return mockResponse(false, 404);
            });

            const result = await api.getNasStreamUrl({ id: '12345', isrc: 'US-S1Z-21-00001' }, 'LOSSLESS');
            expect(result.url).toBe('http://localhost:9876/music/US-S1Z-21-00001.flac');
        });

        test('TIDAL_ID strategy generates correct path format', async () => {
            nasSettings.setEnabled(true);
            nasSettings.setBaseUrl('http://localhost:9876');
            nasSettings.setMappingStrategy('TIDAL_ID');

            globalThis.fetch = vi.fn().mockImplementation(async (url, options = {}) => {
                const urlString = typeof url === 'string' ? url : url.toString();
                if (options.method === 'HEAD' && urlString.includes('/music/123456789.flac')) {
                    return mockResponse(true, 200, null, { 'Content-Length': '1000' });
                }
                return mockResponse(false, 404);
            });

            const result = await api.getNasStreamUrl({ id: '123456789', isrc: 'US-S1Z-21-00001' }, 'LOSSLESS');
            expect(result.url).toBe('http://localhost:9876/music/123456789.flac');
        });

        test('CUSTOM_API strategy uses API resolver result', async () => {
            nasSettings.setEnabled(true);
            nasSettings.setBaseUrl('http://localhost:9876');
            nasSettings.setMappingStrategy('CUSTOM_API');
            nasSettings.setApiUrl('http://localhost:9876');

            globalThis.fetch = vi.fn().mockImplementation(async (url, options = {}) => {
                const urlString = typeof url === 'string' ? url : url.toString();
                if (urlString.includes('/resolve?')) {
                    return mockResponse(true, 200, { path: '/music/987654321.flac' });
                }
                if (options.method === 'HEAD' && urlString.includes('/music/987654321.flac')) {
                    return mockResponse(true, 200, null, { 'Content-Length': '1000' });
                }
                return mockResponse(false, 404);
            });

            const result = await api.getNasStreamUrl({ id: '987654321', isrc: 'US-S1Z-21-00001' }, 'LOSSLESS');
            expect(result.url).toBe('http://localhost:9876/music/987654321.flac');
        });

        test('quality mapping: DOLBY_ATMOS uses mp3 extension', async () => {
            nasSettings.setEnabled(true);
            nasSettings.setBaseUrl('http://localhost:9876');
            nasSettings.setMappingStrategy('ISRC');

            globalThis.fetch = vi.fn().mockImplementation(async (url, options = {}) => {
                const urlString = typeof url === 'string' ? url : url.toString();
                if (options.method === 'HEAD' && urlString.includes('/music/ISRC12345678.mp3')) {
                    return mockResponse(true, 200, null, { 'Content-Length': '500' });
                }
                return mockResponse(false, 404);
            });

            const result = await api.getNasStreamUrl({ id: '12345', isrc: 'ISRC12345678' }, 'DOLBY_ATMOS');
            expect(result.url).toContain('.mp3');
        });

        test('quality mapping: HIGH uses mp3 extension', async () => {
            nasSettings.setEnabled(true);
            nasSettings.setBaseUrl('http://localhost:9876');
            nasSettings.setMappingStrategy('ISRC');

            globalThis.fetch = vi.fn().mockImplementation(async (url, options = {}) => {
                const urlString = typeof url === 'string' ? url : url.toString();
                if (options.method === 'HEAD' && urlString.includes('/music/ISRC12345678.mp3')) {
                    return mockResponse(true, 200, null, { 'Content-Length': '500' });
                }
                return mockResponse(false, 404);
            });

            const result = await api.getNasStreamUrl({ id: '12345', isrc: 'ISRC12345678' }, 'HIGH');
            expect(result.url).toContain('.mp3');
        });

        test('quality mapping: LOW uses mp3 extension', async () => {
            nasSettings.setEnabled(true);
            nasSettings.setBaseUrl('http://localhost:9876');
            nasSettings.setMappingStrategy('ISRC');

            globalThis.fetch = vi.fn().mockImplementation(async (url, options = {}) => {
                const urlString = typeof url === 'string' ? url : url.toString();
                if (options.method === 'HEAD' && urlString.includes('/music/ISRC12345678.mp3')) {
                    return mockResponse(true, 200, null, { 'Content-Length': '500' });
                }
                return mockResponse(false, 404);
            });

            const result = await api.getNasStreamUrl({ id: '12345', isrc: 'ISRC12345678' }, 'LOW');
            expect(result.url).toContain('.mp3');
        });
    });
});
