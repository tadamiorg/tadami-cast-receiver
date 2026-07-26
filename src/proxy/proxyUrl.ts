/**
 * Phone-local proxy URL wrapping (protocol v3).
 *
 * The proxy is a STATELESS forwarder — the receiver carries the current source's headers on
 * every wrapped request; the phone registers nothing and never parses stream payloads:
 *
 *   GET {proxyBaseUrl}/proxy?url=<urlencoded-absolute>[&headers=<urlencoded-json-object>]
 *   GET {proxyBaseUrl}/echo?body=<enc>&type=<enc>
 *   GET {proxyBaseUrl}/health
 *
 * Media rides the proxy only when the CURRENT source is header-bound ([store.currentHeaders])
 * or the target is plain `http://` (blocked mixed content on this https page otherwise);
 * header-less https plays raw, sparing the phone the byte relay.
 *
 * Broken relative-URI resolution is fixed HERE, by proxy-domain detection (the old receiver's
 * getRedirectUrl approach, never by extension/content-type): a player resolving a relative
 * manifest URI against a proxied manifest URL produces `{base}/<segment-path>` — a URL on the
 * proxy origin that is not a legit /proxy request. It is re-based onto [store.lastManifestUrl]
 * and wrapped properly.
 */

import * as store from '../player/store';

function trimBase(proxyBaseUrl: string): string {
	return proxyBaseUrl.replace(/\/+$/, '');
}

/** True when a source's headers actually contain something (protocol normalizes to `{}`/null). */
export function hasHeaders(headers: Record<string, string> | null): boolean {
	return headers !== null && Object.keys(headers).length > 0;
}

/**
 * `{base}/proxy?url=<enc>&headers=<enc-json>&type=<enc-mime>` — the proxied form of one absolute
 * URL. `headers` is omitted when there is nothing to carry; `responseType` (also optional) makes
 * the proxy advertise that Content-Type instead of the upstream's.
 */
export function proxiedUrl(
	proxyBaseUrl: string,
	rawUrl: string,
	headers: Record<string, string> | null,
	responseType?: string,
): string {
	const headersParam = hasHeaders(headers)
		? `&headers=${encodeURIComponent(JSON.stringify(headers))}`
		: '';
	const typeParam = responseType !== undefined ? `&type=${encodeURIComponent(responseType)}` : '';
	return `${trimBase(proxyBaseUrl)}/proxy?url=${encodeURIComponent(rawUrl)}${headersParam}${typeParam}`;
}

/**
 * `{base}/echo?body=<enc>&type=<enc>` — the proxy reflects a receiver-composed body back with
 * the given Content-Type. Lets the receiver serve itself content over plain http (e.g. the
 * synthetic multi-audio HLS master) without the phone knowing anything about formats.
 */
export function echoUrl(proxyBaseUrl: string, body: string, contentType: string): string {
	return `${trimBase(proxyBaseUrl)}/echo?body=${encodeURIComponent(body)}&type=${encodeURIComponent(contentType)}`;
}

/** A well-formed request to the proxy itself (already wrapped / echo master). */
function isProxyRequest(url: string, base: string): boolean {
	const b = trimBase(base);
	return url.startsWith(`${b}/proxy?`) || url.startsWith(`${b}/echo?`) || url.startsWith(`${b}/health`);
}

/** `{base}/sub/seg.ts` → re-resolved against the last manifest URL; null when none is known. */
function rescueProxyOriginUrl(url: string, base: string): string | null {
	const manifestUrl = store.lastManifestUrl.value;
	if (manifestUrl === null) return null;
	try {
		// Doc-relative interpretation (like the old receiver): strip the proxy origin and resolve
		// the remaining path against the manifest URL. Subdirectories are preserved; root-relative
		// manifest URIs keep the old limitation of resolving as document-relative.
		const rel = url.slice(trimBase(base).length).replace(/^\//, '');
		return new URL(rel, manifestUrl).toString();
	} catch {
		return null;
	}
}

/** Extract + decode the `url=` parameter of an already-proxied URL (for manifest recording). */
function upstreamOfProxied(url: string): string | null {
	const match = /[?&]url=([^&]+)/.exec(url);
	if (match === null) return null;
	try {
		return decodeURIComponent(match[1]);
	} catch {
		return null;
	}
}

/**
 * Network-layer wrap for outgoing media request URLs (manifests, segments, licenses — whatever
 * the player asks for). Manifest requests additionally record [store.lastManifestUrl], the
 * rescue's re-base target.
 *
 * Non-manifest wraps carry `type=video/mp2t`: anime CDNs disguise segments as images (`.jpg` +
 * `Content-Type: image/jpeg`), and when Shaka cannot guess a stream's container from the segment
 * extension it HEAD-probes the first segment and uses the probed Content-Type VERBATIM
 * (→ `addSourceBuffer('image/jpeg')` → fatal 3015). Shaka 4.15+ byte-sniffs only generic binary
 * types (application/octet-stream), at the cost of an extra full-segment GET through the phone —
 * so we assert the byte-verified container truth (0x47 TS sync, H.264 + AAC-ADTS) directly.
 * Segment-data GETs are parsed by content, so the override only ever influences the probe;
 * sources with guessable extensions (.ts/.m4s/.mp4) never probe, where it stays inert. A
 * hypothetical fMP4 source with unguessable extensions would break either way — accepted.
 *
 * Passes through unchanged when: no proxy base is known (yet), the URL is already a legit proxy
 * request, the scheme is not http(s) (`data:` synthetic manifests, `blob:`), or the current
 * source carries no headers and the target is https.
 */
export function wrapRequestUrl(url: string, isManifest = false): string {
	const base = store.proxyBaseUrl.value;
	if (base === null || url === '') return url;
	if (!/^https?:\/\//i.test(url)) return url;
	const headers = store.currentHeaders.value;
	// Manifests keep their real type (CAF HEAD-probes the top-level manifest for HLS/DASH
	// detection); segment/license responses assert the TS container for the mime probe.
	const responseType = isManifest ? undefined : 'video/mp2t';

	if (isProxyRequest(url, base)) {
		if (isManifest) {
			const upstream = upstreamOfProxied(url);
			if (upstream !== null) store.lastManifestUrl.value = upstream;
		}
		return url;
	}

	// Proxy-domain rescue: the URL points at the proxy origin but is not a proxy request — a
	// relative manifest URI resolved against a proxied manifest URL. A broken-relative can only
	// come from a proxied (header-bound) manifest, so the fixed URL is always wrapped.
	if (url.startsWith(trimBase(base))) {
		const fixed = rescueProxyOriginUrl(url, base);
		if (fixed === null) return url;
		if (isManifest) store.lastManifestUrl.value = fixed;
		return proxiedUrl(base, fixed, headers, responseType);
	}

	if (isManifest) store.lastManifestUrl.value = url;
	if (!hasHeaders(headers) && !/^http:\/\//i.test(url)) return url;
	return proxiedUrl(base, url, headers, responseType);
}

/**
 * Ungated variant of [wrapRequestUrl] for `fetch()`-based consumers (the subtitle engine):
 * plain fetches need the proxy's permissive CORS headers no matter whether the source itself
 * is header-bound, because subtitle origins rarely send Access-Control-Allow-Origin.
 */
export function wrapCorsUrl(url: string): string {
	const base = store.proxyBaseUrl.value;
	if (base === null || url === '') return url;
	if (!/^https?:\/\//i.test(url)) return url;
	if (url.startsWith(trimBase(base))) return url;
	return proxiedUrl(base, url, store.currentHeaders.value);
}
