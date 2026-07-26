import { afterEach, describe, expect, it } from 'vitest';
import type { StreamSource } from '../cast/protocol';
import * as store from './store';
import {
	allAudioHls,
	AUDIO_GROUP,
	audioLanguageTags,
	buildMasterDataUrl,
	buildMasterPlaylist,
	contentTypeFor,
	isHlsUrl,
	isManifestUrl,
	playbackForSource,
} from './hlsMaster';

const BASE = 'http://192.168.1.4:8214';

afterEach(() => {
	store.proxyBaseUrl.value = null;
	store.selectedSourceIndex.value = 0;
});

function source(overrides: Partial<StreamSource>): StreamSource {
	return {
		url: 'https://host.example/video.m3u8',
		fullName: '',
		quality: '',
		server: '',
		headers: null,
		subtitleTracks: [],
		audioTracks: [],
		...overrides,
	};
}

describe('isHlsUrl / allAudioHls', () => {
	it('checks the path extension, ignoring the query', () => {
		expect(isHlsUrl('https://h/x.m3u8')).toBe(true);
		expect(isHlsUrl('https://h/x.M3U8?token=abc')).toBe(true);
		expect(isHlsUrl('https://h/x.mp4')).toBe(false);
		expect(isHlsUrl('https://h/x.mp4?fake=.m3u8')).toBe(false);
	});

	it('requires at least one track and all HLS', () => {
		expect(allAudioHls([])).toBe(false);
		expect(allAudioHls([{ url: 'https://h/a.m3u8', lang: 'jp' }])).toBe(true);
		expect(
			allAudioHls([
				{ url: 'https://h/a.m3u8', lang: 'jp' },
				{ url: 'https://h/b.aac', lang: 'en' },
			]),
		).toBe(false);
	});
});

describe('audioLanguageTags', () => {
	const track = (lang: string) => ({ url: `https://h/${lang}.m3u8`, lang });

	it('maps display names to ISO codes (case/space tolerant)', () => {
		expect(
			audioLanguageTags([track('Japanese'), track('English'), track(' french '), track('GERMAN')]),
		).toEqual(['ja', 'en', 'fr', 'de']);
	});

	it('passes an existing 2-letter code through', () => {
		expect(audioLanguageTags([track('ja'), track('pt')])).toEqual(['ja', 'pt']);
	});

	it('falls back to distinct private-use tags for unknown names', () => {
		expect(audioLanguageTags([track('Klingon'), track('Sindarin')])).toEqual(['qaa', 'qab']);
	});

	it('never repeats a tag when two tracks share a language', () => {
		const tags = audioLanguageTags([track('Portuguese'), track('Portuguese'), track('English')]);
		expect(tags[0]).toBe('pt');
		expect(tags[1]).not.toBe('pt');
		expect(new Set(tags).size).toBe(3);
	});

	it('gives empty langs their own tag', () => {
		const tags = audioLanguageTags([track(''), track('')]);
		expect(new Set(tags).size).toBe(2);
	});

	it('stays unique past 26 tracks', () => {
		const tags = audioLanguageTags(Array.from({ length: 30 }, (_, i) => track(`Unknown ${i}`)));
		expect(new Set(tags).size).toBe(30);
		expect(tags.every((t) => /^q[a-z]{2}$/.test(t))).toBe(true);
	});
});

describe('buildMasterPlaylist', () => {
	const multiAudio = source({
		audioTracks: [
			{ url: 'https://h/audio/jp.m3u8', lang: 'Japanese' },
			{ url: 'https://h/audio/en.m3u8', lang: 'English' },
		],
	});

	it('emits index-stable renditions with absolute RAW uris, first DEFAULT', () => {
		const lines = buildMasterPlaylist(multiAudio).split('\n');
		expect(lines[0]).toBe('#EXTM3U');
		const renditions = lines.filter((l) => l.startsWith('#EXT-X-MEDIA:TYPE=AUDIO'));
		expect(renditions).toHaveLength(2);
		expect(renditions[0]).toContain('NAME="Japanese"');
		expect(renditions[0]).toContain('DEFAULT=YES');
		expect(renditions[0]).toContain('URI="https://h/audio/jp.m3u8"');
		expect(renditions[0]).toContain('CODECS="mp4a.40.2"');
		// LANGUAGE is what CAF/shaka actually switch on — must be present and distinct.
		expect(renditions[0]).toContain('LANGUAGE="ja"');
		expect(renditions[1]).toContain('LANGUAGE="en"');
		expect(renditions[1]).toContain('NAME="English"');
		expect(renditions[1]).toContain('DEFAULT=NO');
		// One variant, with CODECS (required with an audio group) + the group, RAW video playlist.
		const variant = lines.find((l) => l.startsWith('#EXT-X-STREAM-INF'));
		expect(variant).toBeDefined();
		expect(variant).toContain(`AUDIO="${AUDIO_GROUP}"`);
		expect(variant).toContain('CODECS="avc1.640029,mp4a.40.2"');
		expect(lines[lines.length - 1]).toBe('https://host.example/video.m3u8');
	});

	it('falls back to a numbered name when lang is empty, but still carries a LANGUAGE', () => {
		const unnamed = source({ audioTracks: [{ url: 'https://h/a.m3u8', lang: '' }] });
		const playlist = buildMasterPlaylist(unnamed);
		expect(playlist).toContain('NAME="Track 1"');
		expect(playlist).toContain('LANGUAGE="qaa"');
	});

	it('gives every rendition a distinct LANGUAGE (audio switching depends on it)', () => {
		const many = source({
			audioTracks: [
				{ url: 'https://h/jp.m3u8', lang: 'Japanese' },
				{ url: 'https://h/en.m3u8', lang: 'English' },
				{ url: 'https://h/fr.m3u8', lang: 'French' },
				{ url: 'https://h/x.m3u8', lang: 'Unknown' },
			],
		});
		const languages = buildMasterPlaylist(many)
			.split('\n')
			.filter((line) => line.startsWith('#EXT-X-MEDIA:TYPE=AUDIO'))
			.map((line) => /LANGUAGE="([^"]+)"/.exec(line)?.[1]);
		expect(languages).toHaveLength(4);
		expect(languages.every((l) => l !== undefined && l !== '')).toBe(true);
		expect(new Set(languages).size).toBe(4);
	});

	it('round-trips through the data: url', () => {
		const dataUrl = buildMasterDataUrl(multiAudio);
		expect(dataUrl.startsWith('data:application/vnd.apple.mpegurl;base64,')).toBe(true);
		const decoded = new TextDecoder().decode(
			Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0)),
		);
		expect(decoded).toBe(buildMasterPlaylist(multiAudio));
	});
});

describe('isManifestUrl / contentTypeFor', () => {
	it('recognizes adaptive manifests only', () => {
		expect(isManifestUrl('https://h/x.m3u8?tok=1')).toBe(true);
		expect(isManifestUrl('https://h/stream.mpd')).toBe(true);
		expect(isManifestUrl('https://h/v/12345.mp4')).toBe(false);
	});

	it('maps container mimes and defaults to mp4', () => {
		expect(contentTypeFor('https://h/v/12345.mp4?x=1')).toBe('video/mp4');
		expect(contentTypeFor('https://h/a.webm')).toBe('video/webm');
		expect(contentTypeFor('https://h/a.mp3')).toBe('audio/mpeg');
		expect(contentTypeFor('https://h/stream')).toBe('video/mp4');
	});
});

describe('playbackForSource', () => {
	const demuxed = source({ audioTracks: [{ url: 'https://h/jp.m3u8', lang: 'jp' }] });
	const boundHeaders = { Referer: 'https://anime-site.example/' };
	const headersParam = `&headers=${encodeURIComponent(JSON.stringify(boundHeaders))}`;

	it('serves the synthetic master via /echo when the proxy is known', () => {
		store.proxyBaseUrl.value = BASE;
		const target = playbackForSource(demuxed);
		expect(target.url).toBe(
			`${BASE}/echo?body=${encodeURIComponent(buildMasterPlaylist(demuxed))}&type=${encodeURIComponent('application/vnd.apple.mpegurl')}`,
		);
		expect(target.contentType).toBe('application/vnd.apple.mpegurl');
	});

	it('falls back to a data: master without a proxy (dev shim)', () => {
		const target = playbackForSource(demuxed);
		expect(target.url.startsWith('data:application/vnd.apple.mpegurl;base64,')).toBe(true);
	});

	it('keeps adaptive manifests RAW (request handlers wrap their fetches) with an explicit mime', () => {
		store.proxyBaseUrl.value = BASE;
		expect(playbackForSource(source({ headers: boundHeaders }))).toEqual({
			url: 'https://host.example/video.m3u8',
			contentType: 'application/vnd.apple.mpegurl',
		});
		expect(playbackForSource(source({ url: 'https://h/stream.mpd' }))).toEqual({
			url: 'https://h/stream.mpd',
			contentType: 'application/dash+xml',
		});
	});

	it('wraps header-bound progressive files through /proxy at load time (handlers never fire for them)', () => {
		store.proxyBaseUrl.value = BASE;
		const sibnet = source({
			url: 'https://video.sibnet.ru/v/abc/6248454.mp4',
			headers: boundHeaders,
			audioTracks: [],
		});
		expect(playbackForSource(sibnet)).toEqual({
			url: `${BASE}/proxy?url=${encodeURIComponent('https://video.sibnet.ru/v/abc/6248454.mp4')}${headersParam}`,
			contentType: 'video/mp4',
		});
	});

	it('plays header-less https progressive files raw (no phone relay)', () => {
		store.proxyBaseUrl.value = BASE;
		const open = source({ url: 'https://h/v/open.mp4' });
		expect(playbackForSource(open)).toEqual({ url: 'https://h/v/open.mp4', contentType: 'video/mp4' });
	});

	it('always wraps plain http:// progressive files (mixed content on the https page)', () => {
		store.proxyBaseUrl.value = BASE;
		const insecure = source({ url: 'http://h/v/open.mp4' });
		expect(playbackForSource(insecure).url).toBe(
			`${BASE}/proxy?url=${encodeURIComponent('http://h/v/open.mp4')}`,
		);
	});

	it('degrades to the raw progressive url when no proxy is known', () => {
		const sibnet = source({ url: 'https://video.sibnet.ru/v/abc/6248454.mp4', headers: boundHeaders });
		expect(playbackForSource(sibnet).url).toBe('https://video.sibnet.ru/v/abc/6248454.mp4');
	});

	it('raw-audio sources stay progressive/manifest by the video url (no master)', () => {
		store.proxyBaseUrl.value = BASE;
		const rawAudio = source({ audioTracks: [{ url: 'https://h/audio.aac', lang: 'en' }] });
		expect(playbackForSource(rawAudio).url).toBe('https://host.example/video.m3u8');
	});
});
