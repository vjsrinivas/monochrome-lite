//js/tracker.js
import { escapeHtml, trackDataStore, formatTime } from './utils.js';
import { navigate } from './router.js';
import { SVG_MENU, SVG_PLAY, SVG_HEART } from './icons.js';
import { Player } from './player.js';

let artistsData = [];
let artistsPopularity = new Map(); // name -> popularity score

// Map to store artist info keyed by sheetId for quick lookup
const artistBySheetId = new Map();

// Store all songs for search functionality
let allSongsCache = new Map(); // sheetId -> {era, songs}

// Normalize artist name for image URL (no spaces, no special chars, all lowercase)
function normalizeArtistName(name) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Clean song title for scrobbling (remove producer credits)
function cleanSongTitle(title) {
    if (!title) return '';
    // Remove (prod. ...), (produced by ...), [prod. ...], etc.
    return title
        .replace(/\s*[([]\s*prod\.?\s+[^)\]]+[)\]]/gi, '')
        .replace(/\s*[([]\s*produced\s+by\s+[^)\]]+[)\]]/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

async function loadArtistsPopularity() {
    try {
        const response = await fetch('https://trends.artistgrid.cx');
        if (!response.ok) return;
        const data = await response.json();
        if (data.results) {
            data.results.forEach((artist, index) => {
                // Store popularity score based on visitors and position
                const score = artist.visitors * (1 - index / data.results.length);
                artistsPopularity.set(artist.name, score);
            });
        }
    } catch (e) {
        console.log('Could not load popularity data:', e);
    }
}

async function loadArtistsData() {
    try {
        const response = await fetch('https://assets.artistgrid.cx/artists.ndjson');
        if (!response.ok) throw new Error('Network response was not ok');
        const text = await response.text();
        artistsData = text
            .trim()
            .split('\n')
            .filter((line) => line.trim())
            .map((line) => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter((item) => item !== null);

        // Sort by popularity if available
        artistsData.sort((a, b) => {
            const popA = artistsPopularity.get(a.name) || 0;
            const popB = artistsPopularity.get(b.name) || 0;
            return popB - popA;
        });

        // Build sheetId lookup map
        artistBySheetId.clear();
        artistsData.forEach((artist) => {
            const sheetId = getSheetId(artist.url);
            if (sheetId) {
                artistBySheetId.set(sheetId, artist);
            }
        });
    } catch (e) {
        console.error('Failed to load Artists List:', e);
    }
}

function getSheetId(url) {
    if (!url) return null;
    const match = url.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
}

function transformImageUrl(url) {
    if (!url) return url;
    return url.replace('https://s3.sad.ovh/trackerapi/', 'https://r2.artistgrid.cx/');
}

function transformErasImages(eras) {
    if (!eras) return eras;
    for (const eraName in eras) {
        const era = eras[eraName];
        if (era.image) {
            era.image = transformImageUrl(era.image);
        }
    }
    return eras;
}

async function fetchTrackerData(sheetId) {
    const endpoints = [
        'https://trackerapi-1.artistgrid.cx/get/',
        'https://trackerapi-2.artistgrid.cx/get/',
        'https://trackerapi-3.artistgrid.cx/get/',
    ];

    let lastError = null;
    for (const baseUrl of endpoints) {
        try {
            const response = await fetch(`${baseUrl}${sheetId}`);
            if (!response.ok) {
                lastError = new Error(`HTTP ${response.status}`);
                continue;
            }
            const data = await response.json();
            if (data.eras) {
                transformErasImages(data.eras);
            }
            return data;
        } catch (e) {
            lastError = e;
            console.warn(`Failed to fetch from ${baseUrl}, trying next...`);
        }
    }
    console.error('Failed to fetch tracker data from all endpoints', lastError);
    return null;
}

function parseDuration(durationStr) {
    if (!durationStr || durationStr === 'N/A') return 0;
    const parts = durationStr.split(':');
    if (parts.length === 2) {
        return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }
    return 0;
}

function getDirectUrl(rawUrl) {
    if (!rawUrl) return null;

    // Only return URLs that are known to be direct audio links
    if (rawUrl.includes('pillows.su/f/')) {
        const match = rawUrl.match(/pillows\.su\/f\/([a-f0-9]+)/);
        if (match) return `https://api.pillows.su/api/download/${match[1]}`;
    } else if (rawUrl.includes('music.froste.lol/song/')) {
        const match = rawUrl.match(/music\.froste\.lol\/song\/([a-f0-9]+)/);
        if (match) return `https://music.froste.lol/song/${match[1]}/download`;
    }

    // For other URLs, check if they look like direct audio files
    const audioExtensions = ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac'];
    const hasAudioExt = audioExtensions.some((ext) => rawUrl.toLowerCase().includes(ext));

    if (hasAudioExt) {
        return rawUrl;
    }

    // Return null for URLs that don't look like direct audio files
    return null;
}

// Convert tracker song to standard track format
export function createTrackFromSong(song, era, artistName, index, sheetId = '') {
    const isValidUrl = (u) => u && typeof u === 'string' && u.trim().length > 0;
    const rawUrl = (isValidUrl(song.url) ? song.url : null) || (song.urls ? song.urls.find(isValidUrl) : null);
    const directUrl = getDirectUrl(rawUrl);
    const duration = parseDuration(song.track_length);
    const cleanTitle = cleanSongTitle(song.name);

    return {
        id: `tracker-${sheetId}-${era.name}-${index}`,
        title: song.name,
        cleanTitle: cleanTitle,
        artist: {
            name: artistName,
        },
        artists: [
            {
                name: artistName,
            },
        ],
        album: {
            title: era.name,
            cover: era.image,
        },
        duration: duration,
        trackNumber: index + 1,
        isTracker: true,
        audioUrl: directUrl,
        remoteUrl: directUrl,
        explicit: false,
        unavailable: !directUrl,
        // Additional tracker-specific data for context menu
        trackerInfo: {
            sheetId: sheetId,
            timeline: era.timeline,
            description: song.desc || song.description || '',
            sourceUrl: rawUrl,
            category: song.category || '',
        },
    };
}

// Create track item HTML for tracker songs - EXACTLY like normal tracks
function createTrackerTrackItemHTML(track, index) {
    const isUnavailable = track.unavailable;
    const trackNumberHTML = `<div class="track-number">${index + 1}</div>`;

    const actionsHTML = isUnavailable
        ? ''
        : `
        <button class="track-menu-btn" type="button" title="More options">
            ${SVG_MENU(20)}
        </button>
    `;

    return `
        <div class="track-item ${isUnavailable ? 'unavailable' : ''}" 
             data-track-id="${track.id}"
             ${isUnavailable ? 'title="This track is currently unavailable"' : ''}>
            ${trackNumberHTML}
            <div class="track-item-info">
                <div class="track-item-details">
                    <div class="title">${escapeHtml(track.title)}</div>
                    <div class="artist">${escapeHtml(track.artist.name)}</div>
                </div>
            </div>
            <div class="track-item-duration">${isUnavailable ? '--:--' : formatTime(track.duration)}</div>
            <div class="track-item-actions">
                ${actionsHTML}
            </div>
        </div>
    `;
}

// Render tracks for a tracker era - EXACTLY like normal album track list
function renderTrackerTracks(container, tracks) {
    const fragment = document.createDocumentFragment();
    const tempDiv = document.createElement('div');

    // Add header like normal albums
    tempDiv.innerHTML = `
        <div class="track-list-header">
            <span style="width: 40px; text-align: center;">#</span>
            <span>Title</span>
            <span class="duration-header">Duration</span>
            <span style="display: flex; justify-content: flex-end; opacity: 0.8;">Menu</span>
        </div>
    `;

    // Add tracks
    const tracksHTML = tracks.map((track, i) => createTrackerTrackItemHTML(track, i)).join('');

    tempDiv.insertAdjacentHTML('beforeend', tracksHTML);

    // Bind data to elements
    Array.from(tempDiv.children).forEach((element, index) => {
        if (index === 0) return; // Skip header
        const track = tracks[index - 1];
        if (element && track) {
            trackDataStore.set(element, track);
        }
    });

    while (tempDiv.firstChild) {
        fragment.appendChild(tempDiv.firstChild);
    }

    container.innerHTML = '';
    container.appendChild(fragment);
}

// Create project card HTML - EXACTLY like album cards
export function createProjectCardHTML(era, _artist, sheetId, trackCount) {
    const playBtnHTML = `
        <button class="play-btn card-play-btn" data-action="play-card" data-type="tracker-project" data-id="${encodeURIComponent(era.name)}" title="Play">
            ${SVG_PLAY(20)}
        </button>
        <button class="card-menu-btn" data-action="card-menu" data-type="tracker-project" data-id="${encodeURIComponent(era.name)}" title="Menu">
            ${SVG_MENU(20)}
        </button>
    `;

    return `
        <div class="card" data-tracker-project-id="${encodeURIComponent(era.name)}" data-sheet-id="${sheetId}" style="cursor: pointer;">
            <div class="card-image-wrapper">
                <img src="${era.image || 'assets/logo.svg'}" 
                     alt="${escapeHtml(era.name)}" 
                     class="card-image" 
                     loading="lazy"
                     onerror="this.src='assets/logo.svg'">
                <button class="like-btn card-like-btn" data-action="toggle-like" data-type="tracker-project" title="Add to Liked">
                    ${SVG_HEART(20)}
                </button>
                ${playBtnHTML}
            </div>
            <div class="card-info">
                <h3 class="card-title">${escapeHtml(era.name)}</h3>
                <p class="card-subtitle">${era.timeline || 'Unreleased'} • ${trackCount} tracks</p>
            </div>
        </div>
    `;
}

// Render track page for unreleased songs
export async function renderTrackerTrackPage(trackId, container, _ui) {
    // Parse track ID: tracker-{sheetId}-{eraName}-{index}
    const parts = trackId.split('-');
    if (parts.length < 4) {
        container.innerHTML = '<p style="text-align: center; padding: 2rem;">Invalid track ID.</p>';
        return;
    }

    // Reconstruct sheetId (might contain hyphens)
    const sheetId = parts[1];
    const eraName = decodeURIComponent(parts.slice(2, -1).join('-'));
    const trackIndex = parseInt(parts[parts.length - 1]);

    if (!artistsData.length) {
        await loadArtistsData();
    }

    const artist = artistBySheetId.get(sheetId);
    if (!artist) {
        container.innerHTML = '<p style="text-align: center; padding: 2rem;">Artist not found.</p>';
        return;
    }

    const trackerData = await fetchTrackerData(sheetId);
    if (!trackerData || !trackerData.eras) {
        container.innerHTML = '<p style="text-align: center; padding: 2rem;">Failed to load track data.</p>';
        return;
    }

    const era = trackerData.eras[eraName];
    if (!era || !era.data) {
        container.innerHTML = '<p style="text-align: center; padding: 2rem;">Track not found.</p>';
        return;
    }

    // Find the specific track
    let currentTrack = null;
    let allTracks = [];

    Object.values(era.data).forEach((songs) => {
        if (songs && songs.length) {
            songs.forEach((song) => {
                const track = createTrackFromSong(song, era, artist.name, allTracks.length, sheetId);
                allTracks.push(track);
                if (allTracks.length - 1 === trackIndex) {
                    currentTrack = track;
                }
            });
        }
    });

    if (!currentTrack) {
        container.innerHTML = '<p style="text-align: center; padding: 2rem;">Track not found.</p>';
        return;
    }

    // Show track page using album template
    const imageEl = document.getElementById('album-detail-image');
    const titleEl = document.getElementById('album-detail-title');
    const metaEl = document.getElementById('album-detail-meta');
    const prodEl = document.getElementById('album-detail-producer');
    const tracklistContainer = document.getElementById('album-detail-tracklist');
    const playBtn = document.getElementById('play-album-btn');

    imageEl.src = era.image || 'assets/logo.svg';
    imageEl.style.backgroundColor = '';
    imageEl.onerror = function () {
        this.src = 'assets/logo.svg';
    };

    titleEl.textContent = currentTrack.title;
    metaEl.innerHTML = `${era.timeline || 'Unreleased'} • ${formatTime(currentTrack.duration)}`;
    prodEl.innerHTML = `By <a href="/unreleased/${sheetId}">${artist.name}</a> • From <a href="/unreleased/${sheetId}/${encodeURIComponent(era.name)}">${era.name}</a>`;

    if (playBtn) {
        playBtn.innerHTML = `${SVG_PLAY(20)}<span>Play Track</span>`;
        playBtn.onclick = () => {
            const availableTracks = allTracks.filter((t) => !t.unavailable);
            const trackPos = availableTracks.findIndex((t) => t.id === currentTrack.id);
            if (trackPos >= 0 && availableTracks.length > 0) {
                Player.instance.setQueue(availableTracks, trackPos);
                Player.instance.playTrackFromQueue();
            }
        };
    }

    // Hide unnecessary buttons
    const shuffleBtn = document.getElementById('shuffle-album-btn');
    const downloadBtn = document.getElementById('download-album-btn');
    const likeBtn = document.getElementById('like-album-btn');
    const mixBtn = document.getElementById('album-mix-btn');
    const addToPlaylistBtn = document.getElementById('add-album-to-playlist-btn');

    if (shuffleBtn) shuffleBtn.style.display = 'none';
    if (downloadBtn) downloadBtn.style.display = 'none';
    if (likeBtn) likeBtn.style.display = 'none';
    if (mixBtn) mixBtn.style.display = 'none';
    if (addToPlaylistBtn) addToPlaylistBtn.style.display = 'none';

    // Render just this track
    renderTrackerTracks(tracklistContainer, [currentTrack]);

    // Add click handler
    const trackItem = tracklistContainer.querySelector('.track-item');
    if (trackItem && !currentTrack.unavailable) {
        trackItem.onclick = (e) => {
            if (e.target.closest('.track-menu-btn')) return;

            const availableTracks = allTracks.filter((t) => !t.unavailable);
            const trackPos = availableTracks.findIndex((t) => t.id === currentTrack.id);
            if (trackPos >= 0 && availableTracks.length > 0) {
                Player.instance.setQueue(availableTracks, trackPos);
                Player.instance.playTrackFromQueue();
            }
        };
    }

    // Show other projects
    const moreAlbumsSection = document.getElementById('album-section-more-albums');
    const moreAlbumsContainer = document.getElementById('album-detail-more-albums');
    const moreAlbumsTitle = document.getElementById('album-title-more-albums');

    if (moreAlbumsSection && moreAlbumsContainer) {
        const otherEras = Object.values(trackerData.eras).filter((e) => e.name !== eraName);
        if (otherEras.length > 0) {
            moreAlbumsContainer.innerHTML = otherEras
                .map((e) => {
                    let trackCount = 0;
                    if (e.data) {
                        Object.values(e.data).forEach((songs) => {
                            if (songs && songs.length) trackCount += songs.length;
                        });
                    }
                    return createProjectCardHTML(e, artist, sheetId, trackCount);
                })
                .join('');

            if (moreAlbumsTitle) moreAlbumsTitle.textContent = `More unreleased from ${artist.name}`;
            moreAlbumsSection.style.display = 'block';
        } else {
            moreAlbumsSection.style.display = 'none';
        }
    }

    const epsSection = document.getElementById('album-section-eps');
    const similarArtistsSection = document.getElementById('album-section-similar-artists');
    const similarAlbumsSection = document.getElementById('album-section-similar-albums');

    if (epsSection) epsSection.style.display = 'none';
    if (similarArtistsSection) similarArtistsSection.style.display = 'none';
    if (similarAlbumsSection) similarAlbumsSection.style.display = 'none';

    document.title = `${currentTrack.title} - ${artist.name}`;
}

export async function initTracker() {
    await Promise.all([loadArtistsPopularity(), loadArtistsData()]);
}

// Helper function to find a tracker artist by name (for use in normal artist pages)
export function findTrackerArtistByName(artistName) {
    // First try exact match
    if (!artistName) return null;

    let match = artistsData.find((a) => a.name?.toLowerCase() === artistName.toLowerCase());
    if (match) return match;

    // Try fuzzy match (remove special chars and spaces)
    const normalized = artistName.toLowerCase().replace(/[^a-z0-9]/g, '');
    match = artistsData.find((a) => {
        if (!a.name) return false;
        const aNormalized = a.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return aNormalized === normalized || aNormalized.includes(normalized) || normalized.includes(aNormalized);
    });

    return match || null;
}

// Helper function to get artist's unreleased projects (for use in normal artist pages)
export async function getArtistUnreleasedProjects(artistName) {
    const artist = findTrackerArtistByName(artistName);
    if (!artist) return null;

    const sheetId = getSheetId(artist.url);
    if (!sheetId) return null;

    const trackerData = await fetchTrackerData(sheetId);
    if (!trackerData || !trackerData.eras) return null;

    return {
        artist,
        sheetId,
        eras: Object.values(trackerData.eras),
    };
}
