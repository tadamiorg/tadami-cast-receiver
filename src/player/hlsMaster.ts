/**
 * Receiver-side synthetic multi-audio HLS master.
 *
 * Demuxed sources (PlaylistUtils splits masters into per-variant media playlists) arrive
 * as an audio-less video playlist URL plus external audio playlist URLs in `audioTracks`.
 * A browser player cannot merge independent streams, but Shaka merges HLS renditions —
 * so the receiver synthesizes a master playlist FROM TRACK DATA ALONE (no fetching, no
 * format sniffing anywhere else) and hands it to CAF as a `data:` manifest. Every URI in
 * it is the absolute RAW upstream URL; the network-layer request handlers wrap each
 * resulting fetch through the phone proxy when the source is header-bound.
 *
 * Only possible when every external audio track is itself HLS: sources with raw audio
 * files (DASH-extracted representations) degrade to the video's own audio.
 */

import type { AudioTrack, StreamSource } from '../cast/protocol';
import { echoUrl, hasHeaders, proxiedUrl } from '../proxy/proxyUrl';
import * as store from './store';

export const AUDIO_GROUP = 'tadami-aud';

const HLS_MIME = 'application/vnd.apple.mpegurl';
const DASH_MIME = 'application/dash+xml';

/** Heuristic HLS check on a URL (query string ignored). */
export function isHlsUrl(url: string): boolean {
	const path = url.split(/[?#]/, 1)[0];
	return /\.m3u8$/i.test(path);
}

/** Adaptive-manifest check: only these flow through CAF's request handlers. */
export function isManifestUrl(url: string): boolean {
	const path = url.split(/[?#]/, 1)[0];
	return /\.(m3u8|mpd)$/i.test(path);
}

/** Container mime by raw extension, for URLs CAF can't sniff (proxied — no extension). */
export function contentTypeFor(url: string): string {
	const path = url.split(/[?#]/, 1)[0].toLowerCase();
	if (/\.(mp4|m4v|mov)$/.test(path)) return 'video/mp4';
	if (/\.webm$/.test(path)) return 'video/webm';
	if (/\.mp3$/.test(path)) return 'audio/mpeg';
	if (/\.(aac|m4a)$/.test(path)) return 'audio/mp4';
	// Extension-less progressive URLs (e.g. Sendvid's fallback branch): assume mp4.
	return 'video/mp4';
}

/** True when the synthetic master is usable: at least one audio track and all of them HLS. */
export function allAudioHls(audioTracks: AudioTrack[]): boolean {
	return audioTracks.length > 0 && audioTracks.every((t) => isHlsUrl(t.url));
}

/** Display name (extractors send e.g. "Japanese") → ISO 639-1. */
const LANGUAGE_CODES = new Map<string, string>([
	['japanese', 'ja'],
	['english', 'en'],
	['french', 'fr'],
	['german', 'de'],
	['spanish', 'es'],
	['italian', 'it'],
	['portuguese', 'pt'],
	['thai', 'th'],
	['arabic', 'ar'],
	['hindi', 'hi'],
	['indonesian', 'id'],
	['korean', 'ko'],
	['malay', 'ms'],
	['dutch', 'nl'],
	['polish', 'pl'],
	['turkish', 'tr'],
	['chinese', 'zh'],
	['russian', 'ru'],
	['vietnamese', 'vi'],
]);

/**
 * One DISTINCT language tag per audio rendition — load-bearing, not cosmetic.
 *
 * CAF switches audio by calling shaka's `selectAudioLanguage(track.language)`. Shaka defaults a
 * rendition with no `LANGUAGE` to `'und'`, which is truthy, so with identical languages EVERY
 * switch resolves to the same (first) variant and the audio never changes. Distinct valid tags
 * make the selection unambiguous.
 *
 * Unmapped names — and any name that would collide with a tag already used in this group — get an
 * ISO 639-2 private-use tag (`qaa`, `qab`, …): valid codes shaka preserves, guaranteed unique.
 */
export function audioLanguageTags(tracks: AudioTrack[]): string[] {
	const used = new Set<string>();
	return tracks.map((track, index) => {
		const name = track.lang.trim().toLowerCase();
		const mapped = /^[a-z]{2}$/.test(name) ? name : LANGUAGE_CODES.get(name);
		const tag = mapped !== undefined && !used.has(mapped) ? mapped : privateUseTag(index);
		used.add(tag);
		return tag;
	});
}

/** `qaa`..`qtz` is the ISO 639-2 private-use range — 676 slots, far past any real track count. */
function privateUseTag(index: number): string {
	const first = Math.floor(index / 26) % 26;
	return `q${String.fromCharCode(97 + first)}${String.fromCharCode(97 + (index % 26))}`;
}

// H.264 High@4.1 + AAC-LC — the dominant anime codec pair. CODECS is REQUIRED by the HLS spec
// once an audio group is referenced, and Shaka needs it to set up the separate MSE SourceBuffers
// for demuxed audio+video; without it the load throws (fatal). The string is a hint MSE tolerates
// minor mismatch on, and this master is only built for demuxed-HLS sources.
const VIDEO_CODECS = 'avc1.640029,mp4a.40.2';
const AUDIO_CODEC = 'mp4a.40.2';

/** The master playlist text: index-stable renditions (first = DEFAULT) + one video variant. */
export function buildMasterPlaylist(source: StreamSource): string {
	const lines: string[] = ['#EXTM3U'];
	// LANGUAGE must be present AND distinct per rendition or audio switching silently no-ops —
	// see audioLanguageTags. NAME stays the human label.
	const tags = audioLanguageTags(source.audioTracks);
	source.audioTracks.forEach((track, index) => {
		const name = (track.lang !== '' ? track.lang : `Track ${index + 1}`).replace(/"/g, '');
		lines.push(
			`#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="${AUDIO_GROUP}",NAME="${name}",LANGUAGE="${tags[index]}",` +
				`DEFAULT=${index === 0 ? 'YES' : 'NO'},AUTOSELECT=YES,CODECS="${AUDIO_CODEC}",URI="${track.url}"`,
		);
	});
	lines.push(
		`#EXT-X-STREAM-INF:BANDWIDTH=2000000,CODECS="${VIDEO_CODECS}",RESOLUTION=1920x1080,AUDIO="${AUDIO_GROUP}"`,
	);
	lines.push(source.url);
	return lines.join('\n');
}

/** `data:` URL of the synthetic master (Shaka supports data: manifests natively). */
export function buildMasterDataUrl(source: StreamSource): string {
	const playlist = buildMasterPlaylist(source);
	// btoa is Latin-1 only; URLs/langs can hold arbitrary unicode — encode via UTF-8 bytes.
	const bytes = new TextEncoder().encode(playlist);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return `data:${HLS_MIME};base64,${btoa(binary)}`;
}

export interface PlaybackTarget {
	url: string;
	/** Always set explicitly — CAF rejects loads it can't type (proxied/data: URLs have no extension). */
	contentType: string;
}

/**
 * Playback target for a source — the single resolver both load paths use, covering every
 * stream kind:
 * - demuxed multi-audio HLS → synthetic master served back to us by the proxy's /echo
 *   endpoint (plain http; `data:` fallback when no proxy is known, e.g. the dev shim);
 * - adaptive manifests (.m3u8/.mpd) → RAW url: the request handlers wrap every fetch of a
 *   header-bound source and relative URIs resolve natively either way (HLS, DASH, anything
 *   Shaka speaks);
 * - progressive files (mp4/webm/…) → wrapped through /proxy AT LOAD TIME when the source is
 *   header-bound (or plain http:// — mixed content): CAF's request handlers fire only for
 *   adaptive streaming, so a raw progressive URL would be fetched without the source's
 *   headers. Header-less https progressive plays raw.
 */
export function playbackForSource(source: StreamSource): PlaybackTarget {
	const base = store.proxyBaseUrl.value;
	if (allAudioHls(source.audioTracks)) {
		const url =
			base !== null ? echoUrl(base, buildMasterPlaylist(source), HLS_MIME) : buildMasterDataUrl(source);
		return { url, contentType: HLS_MIME };
	}
	if (isManifestUrl(source.url)) {
		return { url: source.url, contentType: isHlsUrl(source.url) ? HLS_MIME : DASH_MIME };
	}
	const mustProxy =
		base !== null && (hasHeaders(source.headers) || /^http:\/\//i.test(source.url));
	return {
		url: mustProxy ? proxiedUrl(base, source.url, source.headers) : source.url,
		contentType: contentTypeFor(source.url),
	};
}
