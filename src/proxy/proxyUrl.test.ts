import { afterEach, describe, expect, it } from 'vitest';
import * as store from '../player/store';
import { hasHeaders, proxiedUrl, wrapCorsUrl, wrapRequestUrl } from './proxyUrl';

const BASE = 'http://192.168.1.4:8214';
const HEADERS = { Referer: 'https://anime-site.example/' };
const HEADERS_PARAM = `&headers=${encodeURIComponent(JSON.stringify(HEADERS))}`;
// Segment-kind wraps assert the TS container so Shaka's mime probe never sees decoy CDN types.
const TS_PARAM = `&type=${encodeURIComponent('video/mp2t')}`;

afterEach(() => {
	store.proxyBaseUrl.value = null;
	store.selectedSourceIndex.value = 0;
	store.currentHeaders.value = null;
	store.lastManifestUrl.value = null;
});

describe('hasHeaders', () => {
	it('requires a non-empty object (protocol normalizes empty JSON to {})', () => {
		expect(hasHeaders(null)).toBe(false);
		expect(hasHeaders({})).toBe(false);
		expect(hasHeaders(HEADERS)).toBe(true);
	});
});

describe('proxiedUrl', () => {
	it('url-encodes the absolute URL and carries the headers json', () => {
		expect(proxiedUrl(BASE, 'https://host.example/a b.m3u8?x=1&y=2', HEADERS)).toBe(
			`${BASE}/proxy?url=${encodeURIComponent('https://host.example/a b.m3u8?x=1&y=2')}${HEADERS_PARAM}`,
		);
	});

	it('omits the headers parameter when there is nothing to carry', () => {
		expect(proxiedUrl(BASE, 'https://h/x.mp4', null)).toBe(
			`${BASE}/proxy?url=${encodeURIComponent('https://h/x.mp4')}`,
		);
		expect(proxiedUrl(BASE, 'https://h/x.mp4', {})).toBe(
			`${BASE}/proxy?url=${encodeURIComponent('https://h/x.mp4')}`,
		);
	});

	it('tolerates a trailing slash on the base', () => {
		expect(proxiedUrl(`${BASE}/`, 'https://h/x.mp4', null)).toBe(
			`${BASE}/proxy?url=${encodeURIComponent('https://h/x.mp4')}`,
		);
	});

	it('appends the response-type override when provided', () => {
		expect(proxiedUrl(BASE, 'https://h/seg.jpg', HEADERS, 'video/mp2t')).toBe(
			`${BASE}/proxy?url=${encodeURIComponent('https://h/seg.jpg')}${HEADERS_PARAM}${TS_PARAM}`,
		);
	});
});

describe('wrapRequestUrl', () => {
	it('passes through when no proxy base is known', () => {
		store.currentHeaders.value = HEADERS;
		expect(wrapRequestUrl('https://h/seg.ts')).toBe('https://h/seg.ts');
	});

	it('wraps header-bound segment requests with headers + TS response type', () => {
		store.proxyBaseUrl.value = BASE;
		store.currentHeaders.value = HEADERS;
		expect(wrapRequestUrl('https://h/seg.ts')).toBe(
			`${BASE}/proxy?url=${encodeURIComponent('https://h/seg.ts')}${HEADERS_PARAM}${TS_PARAM}`,
		);
	});

	it('manifest wraps keep the real upstream content-type (no override)', () => {
		store.proxyBaseUrl.value = BASE;
		store.currentHeaders.value = HEADERS;
		expect(wrapRequestUrl('https://h/index.m3u8', true)).toBe(
			`${BASE}/proxy?url=${encodeURIComponent('https://h/index.m3u8')}${HEADERS_PARAM}`,
		);
	});

	it('plays header-less https requests raw (no phone relay)', () => {
		store.proxyBaseUrl.value = BASE;
		expect(wrapRequestUrl('https://h/seg.ts')).toBe('https://h/seg.ts');
	});

	it('always wraps plain http:// targets (mixed content on the https receiver page)', () => {
		store.proxyBaseUrl.value = BASE;
		expect(wrapRequestUrl('http://h/seg.ts')).toBe(
			`${BASE}/proxy?url=${encodeURIComponent('http://h/seg.ts')}${TS_PARAM}`,
		);
	});

	it('never touches legit proxy requests (/proxy?, /echo?)', () => {
		store.proxyBaseUrl.value = BASE;
		store.currentHeaders.value = HEADERS;
		const wrapped = wrapRequestUrl('https://h/manifest.m3u8');
		expect(wrapRequestUrl(wrapped)).toBe(wrapped);
		const echo = `${BASE}/echo?body=x&type=y`;
		expect(wrapRequestUrl(echo)).toBe(echo);
	});

	it('leaves non-http(s) schemes untouched (data: synthetic manifests, blob:)', () => {
		store.proxyBaseUrl.value = BASE;
		store.currentHeaders.value = HEADERS;
		const dataUrl = 'data:application/vnd.apple.mpegurl;base64,I0VYVE0zVQ==';
		expect(wrapRequestUrl(dataUrl)).toBe(dataUrl);
		expect(wrapRequestUrl('blob:https://receiver/xyz')).toBe('blob:https://receiver/xyz');
		expect(wrapRequestUrl('')).toBe('');
	});

	describe('proxy-domain rescue (broken relative resolution)', () => {
		it('re-bases a proxy-origin URL onto the last manifest URL and wraps it', () => {
			store.proxyBaseUrl.value = BASE;
			store.currentHeaders.value = HEADERS;
			store.lastManifestUrl.value = 'https://cdn.example.com/anime/ep1/index.m3u8';
			expect(wrapRequestUrl(`${BASE}/seg-001.ts`)).toBe(
				`${BASE}/proxy?url=${encodeURIComponent('https://cdn.example.com/anime/ep1/seg-001.ts')}${HEADERS_PARAM}${TS_PARAM}`,
			);
		});

		it('preserves subdirectories (better than the old last-segment logic)', () => {
			store.proxyBaseUrl.value = BASE;
			store.currentHeaders.value = HEADERS;
			store.lastManifestUrl.value = 'https://cdn.example.com/anime/ep1/index.m3u8';
			expect(wrapRequestUrl(`${BASE}/sub/seg-002.ts`)).toBe(
				`${BASE}/proxy?url=${encodeURIComponent('https://cdn.example.com/anime/ep1/sub/seg-002.ts')}${HEADERS_PARAM}${TS_PARAM}`,
			);
		});

		it('keeps the query string of the broken URL', () => {
			store.proxyBaseUrl.value = BASE;
			store.currentHeaders.value = HEADERS;
			store.lastManifestUrl.value = 'https://cdn.example.com/ep1/index.m3u8';
			expect(wrapRequestUrl(`${BASE}/seg.ts?token=abc`)).toBe(
				`${BASE}/proxy?url=${encodeURIComponent('https://cdn.example.com/ep1/seg.ts?token=abc')}${HEADERS_PARAM}${TS_PARAM}`,
			);
		});

		it('passes through unchanged when no manifest URL is known', () => {
			store.proxyBaseUrl.value = BASE;
			store.currentHeaders.value = HEADERS;
			expect(wrapRequestUrl(`${BASE}/seg-001.ts`)).toBe(`${BASE}/seg-001.ts`);
		});
	});

	describe('manifest recording (isManifest flag)', () => {
		it('records the raw URL of a wrapped manifest request', () => {
			store.proxyBaseUrl.value = BASE;
			store.currentHeaders.value = HEADERS;
			wrapRequestUrl('https://cdn.example.com/ep1/index.m3u8', true);
			expect(store.lastManifestUrl.value).toBe('https://cdn.example.com/ep1/index.m3u8');
		});

		it('records the raw URL even when the manifest plays raw (header-less)', () => {
			store.proxyBaseUrl.value = BASE;
			wrapRequestUrl('https://cdn.example.com/ep1/index.m3u8', true);
			expect(store.lastManifestUrl.value).toBe('https://cdn.example.com/ep1/index.m3u8');
		});

		it('records the decoded upstream of an already-proxied manifest request', () => {
			store.proxyBaseUrl.value = BASE;
			const proxied = proxiedUrl(BASE, 'https://cdn.example.com/ep1/720p.m3u8', HEADERS);
			wrapRequestUrl(proxied, true);
			expect(store.lastManifestUrl.value).toBe('https://cdn.example.com/ep1/720p.m3u8');
		});

		it('records the rescued URL of a broken-relative manifest request (variant playlist)', () => {
			store.proxyBaseUrl.value = BASE;
			store.currentHeaders.value = HEADERS;
			store.lastManifestUrl.value = 'https://cdn.example.com/ep1/index.m3u8';
			wrapRequestUrl(`${BASE}/720p/index.m3u8`, true);
			expect(store.lastManifestUrl.value).toBe('https://cdn.example.com/ep1/720p/index.m3u8');
		});

		it('segment requests never move the manifest base', () => {
			store.proxyBaseUrl.value = BASE;
			store.currentHeaders.value = HEADERS;
			store.lastManifestUrl.value = 'https://cdn.example.com/ep1/index.m3u8';
			wrapRequestUrl('https://other.example/seg.ts');
			expect(store.lastManifestUrl.value).toBe('https://cdn.example.com/ep1/index.m3u8');
		});
	});
});

describe('wrapCorsUrl', () => {
	it('wraps regardless of the header gate (plain fetches need the proxy CORS headers)', () => {
		store.proxyBaseUrl.value = BASE;
		expect(wrapCorsUrl('https://h/subs/ep1.vtt')).toBe(
			`${BASE}/proxy?url=${encodeURIComponent('https://h/subs/ep1.vtt')}`,
		);
	});

	it('carries the current headers when the source has them', () => {
		store.proxyBaseUrl.value = BASE;
		store.currentHeaders.value = HEADERS;
		expect(wrapCorsUrl('https://h/subs/ep1.vtt')).toBe(
			`${BASE}/proxy?url=${encodeURIComponent('https://h/subs/ep1.vtt')}${HEADERS_PARAM}`,
		);
	});

	it('keeps the no-base / non-http / already-proxied passthroughs', () => {
		expect(wrapCorsUrl('https://h/subs.vtt')).toBe('https://h/subs.vtt');
		store.proxyBaseUrl.value = BASE;
		expect(wrapCorsUrl('data:text/vtt,WEBVTT')).toBe('data:text/vtt,WEBVTT');
		const wrapped = wrapCorsUrl('https://h/subs.vtt');
		expect(wrapCorsUrl(wrapped)).toBe(wrapped);
	});
});
