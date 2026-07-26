/**
 * CAF context bootstrap and the receiver's brain:
 *  - context.start() with the 4 Tadami JSON namespaces,
 *  - LOAD interceptor (customData parse → store; protocol gates; contentUrl passthrough
 *    with proxy fallback; subtitle MediaTracks copied into the store then STRIPPED so CAF
 *    never renders text; duplicate-LOAD keeps the current position),
 *  - EDIT_TRACKS_INFO interceptor (activeTrackIds → local subtitle selection, swallowed),
 *  - PlayerManager events → store signals + a 500 ms position ticker,
 *  - sender-disconnect teardown.
 */

import type {
	CastReceiverContext,
	PlaybackConfig,
	PlayerManager,
} from 'chromecast-caf-receiver/cast.framework';
import type {
	EditTracksInfoRequestData,
	LoadRequestData,
	Track,
} from 'chromecast-caf-receiver/cast.framework.messages';
import type { BufferingEvent, MediaPauseEvent } from 'chromecast-caf-receiver/cast.framework.events';
import * as store from '../player/store';
import {
	applyAudioSelection,
	applySubtitleSelection,
	getLoadedContentUrl,
	selectSubtitle,
	setLoadedContentUrl,
} from '../player/tracks';
import { allAudioHls, playbackForSource } from '../player/hlsMaster';
import { initSubtitleEngine } from '../player/subtitles/subtitleEngine';
import { wrapRequestUrl } from '../proxy/proxyUrl';
import { initChannels } from './channels';
import { debugLog, isDebug } from './debug';
import { hideNativeUi } from './hideNativeUi';
import { playbackFlagsFor } from './playerState';
import { reportCastError } from './errorReporter';
import {
	CastErrorCode,
	CONTROL_NAMESPACE,
	CRASH_NAMESPACE,
	ERROR_NAMESPACE,
	HANDSHAKE_NAMESPACE,
	MIN_SENDER_PROTOCOL,
	parseCustomData,
	RECEIVER_PROTOCOL,
	sourceLabel,
	type ParsedCustomData,
	type StreamSource,
	type SubtitleTrack,
} from './protocol';

function context(): CastReceiverContext {
	return cast.framework.CastReceiverContext.getInstance();
}

function playerManager(): PlayerManager {
	return context().getPlayerManager();
}

// ---------------------------------------------------------------------------
// LOAD interception
// ---------------------------------------------------------------------------

function resolveSources(cd: ParsedCustomData): { sources: StreamSource[]; selectedIndex: number } {
	const available = cd.availableSources;
	const selected = cd.selectedSource;
	const sources: StreamSource[] =
		available !== null && available.length > 0 ? available : selected !== null ? [selected] : [];
	let selectedIndex: number;
	if (selected !== null) {
		selectedIndex = Math.max(
			0,
			sources.findIndex((s) => s.url === selected.url),
		);
	} else {
		selectedIndex = sources.length > 0 ? 0 : -1;
	}
	return { sources, selectedIndex };
}

/**
 * Store subtitle list for the initial source. URLs stay RAW — the subtitle engine wraps
 * them through the proxy at fetch time, like every other media request.
 */
function resolveSubtitles(source: StreamSource | undefined, textTracks: Track[]): SubtitleTrack[] {
	if (source === undefined) {
		return textTracks.map((track) => ({
			url: track.trackContentId ?? '',
			lang: track.language ?? '',
			mimeType: track.trackContentType ?? 'text/x-unknown',
		}));
	}
	return source.subtitleTracks.map((raw, i) => ({
		url: raw.url,
		lang: raw.lang !== '' ? raw.lang : (textTracks[i]?.language ?? ''),
		mimeType: raw.mimeType,
	}));
}

function interceptLoad(request: LoadRequestData): LoadRequestData | null {
	const media = request.media;
	if (media === undefined) return request;

	const cd = parseCustomData(media.customData);
	if (!cd.isTadami) {
		// Receiver-local load (source switch / replay) or a foreign sender: pass through.
		setLoadedContentUrl(media.contentUrl ?? media.contentId ?? null);
		return request;
	}

	// --- Protocol gates (error 104 + blocking notice) ---
	if (cd.minReceiverProtocol > RECEIVER_PROTOCOL) {
		reportCastError(CastErrorCode.UNSUPPORTED);
		store.blockingNotice.value =
			'This receiver is outdated for your Tadami app. Please try again later or install the Tadami Terebi app on your TV.';
		return null;
	}
	if (cd.senderProtocol < MIN_SENDER_PROTOCOL) {
		reportCastError(CastErrorCode.UNSUPPORTED);
		store.blockingNotice.value =
			'Your Tadami app is too old for this receiver. Please update the Tadami app on your phone.';
		return null;
	}
	store.blockingNotice.value = null;

	// --- Session context ---
	if (cd.proxyBaseUrl !== null) store.proxyBaseUrl.value = cd.proxyBaseUrl;
	if (cd.userAgent !== null) store.userAgent.value = cd.userAgent;

	// --- Sources & content URL ---
	// URLs stay RAW: header-bound sources are wrapped through the proxy (at the network layer
	// for adaptive streams, at load time for progressive), header-less https sources play raw.
	// The only substitution is the receiver-built synthetic master for demuxed multi-audio HLS.
	const { sources, selectedIndex } = resolveSources(cd);
	const source = sources[selectedIndex];
	// Written BEFORE playbackForSource / the request handlers can observe them. Identical values
	// on a duplicate LOAD, so the dedupe guard below is unaffected.
	store.selectedSourceIndex.value = selectedIndex;
	store.currentHeaders.value = source?.headers ?? null;
	store.lastManifestUrl.value = source !== undefined && source.url !== '' ? source.url : null;
	store.forceTransmux.value = source !== undefined && allAudioHls(source.audioTracks);
	let contentUrl = media.contentUrl ?? media.contentId ?? '';
	if (source !== undefined) {
		const target = playbackForSource(source);
		contentUrl = target.url;
		media.contentType = target.contentType;
	}
	if (contentUrl !== '') {
		media.contentUrl = contentUrl;
		media.contentId = contentUrl;
	}

	// Duplicate LOAD (the phone can fire it several times on a fresh connect): keep the
	// current position instead of restarting from the sender's stale resume time.
	const pm = playerManager();
	const duplicate =
		contentUrl !== '' &&
		contentUrl === getLoadedContentUrl() &&
		pm.getPlayerState() !== cast.framework.messages.PlayerState.IDLE;

	debugLog(
		`LOAD src="${source !== undefined ? sourceLabel(source) : '?'}" type=${media.contentType ?? '?'} ` +
			`subs=${source?.subtitleTracks.length ?? 0} audio=${source?.audioTracks.length ?? 0} ` +
			`dup=${duplicate} url=${contentUrl}`,
	);

	// --- Subtitle MediaTracks + activeTrackIds → store, then STRIP from the request ---
	const textTracks = (media.tracks ?? []).filter(
		(t) => t.type === cast.framework.messages.TrackType.TEXT,
	);
	const activeIds = request.activeTrackIds ?? [];
	media.tracks = undefined;
	media.textTrackStyle = undefined;
	request.activeTrackIds = undefined;

	// --- Metadata → store ---
	const metadata = media.metadata as { title?: string; subtitle?: string } | undefined;
	store.title.value = metadata?.title ?? '';
	store.episodeLabelText.value = metadata?.subtitle ?? '';
	store.episodes.value = cd.episodes;
	store.displayMode.value = cd.displayMode;
	store.currentEpisodeId.value = cd.episodeId;
	if (cd.theme !== null) store.theme.value = cd.theme;
	if (cd.subtitleStyle !== null) store.subtitleStyle.value = cd.subtitleStyle;
	store.hasMedia.value = true;

	if (!duplicate) {
		store.sources.value = sources;
		store.audioTracks.value = source?.audioTracks ?? [];
		store.selectedAudioIndex.value = 0;
		const subtitles = resolveSubtitles(source, textTracks);
		store.subtitles.value = subtitles;
		// activeTrackIds are 1-based text-track ids from CastLoad.kt.
		const activeTextId = activeIds.find((id) => id >= 1 && id <= subtitles.length);
		const subtitleIndex = activeTextId !== undefined ? activeTextId - 1 : null;
		store.selectedSubtitleIndex.value = subtitleIndex;
		store.selectedSubtitleLang.value =
			subtitleIndex !== null ? (subtitles[subtitleIndex]?.lang ?? null) : null;
		applySubtitleSelection();

		store.ended.value = false;
		store.setLoading(true, 'Loading…');
		heartbeatsSent = 0;
	} else {
		request.currentTime = Math.max(0, pm.getCurrentTimeSec() || 0);
	}

	setLoadedContentUrl(contentUrl !== '' ? contentUrl : null);
	return request;
}

/**
 * EDIT_TRACKS_INFO (CAF-native senders): translate activeTrackIds (1-based text ids) into the
 * receiver-local subtitle selection, then swallow the request — CAF holds no text tracks.
 *
 * An EMPTY id list means "subtitles off". A NON-EMPTY list we can't resolve is a sender bug, not an
 * off request: keep the current selection instead of silently disabling subtitles (Tadami's own
 * phone now uses the `selectSubtitle` control message, which carries -1 for off explicitly).
 */
function interceptEditTracks(
	request: EditTracksInfoRequestData,
): EditTracksInfoRequestData | null {
	const ids = request.activeTrackIds;
	if (ids !== undefined && ids !== null) {
		if (ids.length === 0) {
			debugLog('EDIT_TRACKS empty -> subtitles off');
			selectSubtitle(null);
		} else {
			const activeTextId = ids.find((id) => id >= 1 && id <= store.subtitles.value.length);
			if (activeTextId === undefined) {
				debugLog(`EDIT_TRACKS unresolvable ids=[${ids.join(',')}] of ${store.subtitles.value.length} — keeping selection`);
			} else {
				selectSubtitle(activeTextId - 1);
			}
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// Player events → store
// ---------------------------------------------------------------------------

function wirePlayerEvents(): void {
	const pm = playerManager();
	const EventType = cast.framework.events.EventType;

	pm.addEventListener(EventType.PLAYER_LOAD_COMPLETE, () => {
		// The SDK injects its own cast-media-player (with metadata + progress + 30s-skip buttons)
		// when the page has none; by now our <video> has media, so it can be proven safe to hide.
		hideNativeUi();
		const durationSec = pm.getDurationSec();
		store.durationMs.value = Number.isFinite(durationSec) && durationSec > 0 ? durationSec * 1000 : 0;
		store.ended.value = false;
		// Re-apply the preserved audio selection after a local source switch reload.
		applyAudioSelection();
	});

	pm.addEventListener(EventType.PLAYING, () => {
		hideNativeUi(); // cheap no-op once done; covers a UI element injected after the load
		store.isPlaying.value = true;
		store.ended.value = false;
		store.buffering.value = false;
		store.setLoading(false);
	});

	pm.addEventListener(EventType.PAUSE, (event: MediaPauseEvent) => {
		store.isPlaying.value = false;
		if (event.ended === true) store.ended.value = true;
	});

	pm.addEventListener(EventType.BUFFERING, (event: BufferingEvent) => {
		store.buffering.value = event.isBuffering === true;
	});

	pm.addEventListener(EventType.ENDED, () => {
		store.ended.value = true;
		store.isPlaying.value = false;
		store.buffering.value = false;
		store.setLoading(false);
	});

	pm.addEventListener(EventType.ERROR, (event) => {
		// Forward the REAL CAF detailed error code plus the shaka error payload — a blanket 905
		// hides the actual cause, and for network errors the shaka `data` array carries the
		// FAILING URL and HTTP status (e.g. 312 alone never says which playlist died).
		const { detailedErrorCode: detailed, error: err } = event as {
			detailedErrorCode?: number;
			error?: { category?: number; code?: number; data?: unknown[] } | null;
		};
		let detail = '';
		try {
			// Dump the raw error object — its shape differs between the legacy MPL player and
			// Shaka; the shaka form carries category/code/data (with the failing URL for network
			// errors), the MPL form is looser. Truncated: it rides a cast custom message.
			detail =
				err !== null && err !== undefined
					? `shaka ${err.category ?? '?'}/${err.code ?? '?'} raw=${JSON.stringify(err)}`.slice(0, 400)
					: '';
		} catch {
			// Non-serializable error payload — the code alone still goes out.
		}
		debugLog(`ERROR detailedErrorCode=${detailed ?? '?'} ${detail}`);
		reportCastError(detailed ?? CastErrorCode.LOAD_FAILED, detail);
		store.setLoading(false);
		store.buffering.value = false;
	});
}

// ---------------------------------------------------------------------------
// Loading-stall diagnostic heartbeat
// ---------------------------------------------------------------------------

/** Diagnostic errorCode: not an error — a stuck-loading heartbeat riding the error channel. */
const DIAG_CODE = 0;
const HEARTBEAT_MS = 3000;
const MAX_HEARTBEATS_PER_LOAD = 20;
let heartbeatsSent = 0;

/** Our own media surface, declared in index.html and handed to CAF as `options.mediaElement`. */
function findMediaElement(): HTMLVideoElement | null {
	return document.querySelector('video');
}

/**
 * While the loading overlay is up, report the player's real state to the phone (visible in
 * `adb logcat -s CastReceiverError`): CAF playerState, media-element readyState/paused,
 * currentTime and buffered ranges — enough to tell "gap at playhead" from "no data at all"
 * from "never told to play". Capped per LOAD, silent once playback starts.
 *
 * `?debug` receivers only (the dev registration): the production receiver must not stream
 * diagnostics — the detail can carry media URLs — so without the flag the ticker never starts.
 */
function startLoadingHeartbeat(): void {
	if (!isDebug()) return;
	setInterval(() => {
		if (!store.loading.value || heartbeatsSent >= MAX_HEARTBEATS_PER_LOAD) return;
		heartbeatsSent++;
		try {
			const pm = playerManager();
			const videos = document.querySelectorAll('video');
			const video = findMediaElement();
			let buffered = '?';
			if (video !== null) {
				const parts: string[] = [];
				for (let i = 0; i < video.buffered.length; i++) {
					parts.push(`${video.buffered.start(i).toFixed(2)}-${video.buffered.end(i).toFixed(2)}`);
				}
				buffered = `[${parts.join(',')}]`;
			}
			const stats = (pm as unknown as { getStats?: () => { decodedFrames?: number; width?: number; height?: number } })
				.getStats?.();
			const shakaVersion =
				(globalThis as { shaka?: { Player?: { version?: string } } }).shaka?.Player?.version ?? '?';
			const detail =
				`HB caf=${cast.framework.VERSION} shk=${shakaVersion} state=${pm.getPlayerState()} t=${pm.getCurrentTimeSec().toFixed(2)} ` +
				`dur=${pm.getDurationSec().toFixed(2)} nVid=${videos.length}` +
				(video !== null
					? ` vTime=${video.currentTime.toFixed(2)} vDur=${video.duration.toFixed(2)} vReady=${video.readyState}` +
						` net=${video.networkState} paused=${video.paused}` +
						` vErr=${video.error !== null ? `${video.error.code}:${video.error.message}` : '-'}` +
						` src=${(video.currentSrc || video.src || '').slice(0, 30)} buf=${buffered}`
					: ' video=none') +
				` dec=${stats?.decodedFrames ?? '?'} sz=${stats?.width ?? '?'}x${stats?.height ?? '?'}`;
			debugLog(detail);
			reportCastError(DIAG_CODE, detail);
		} catch (e) {
			reportCastError(DIAG_CODE, `HB failed: ${String(e)}`);
		}
	}, HEARTBEAT_MS);
}

// ---------------------------------------------------------------------------
// Position ticker (isolated signal — only the seek bar re-renders)
// ---------------------------------------------------------------------------

let positionTimer: ReturnType<typeof setInterval> | null = null;

function startPositionTicker(): void {
	if (positionTimer !== null) clearInterval(positionTimer);
	positionTimer = setInterval(() => {
		if (!store.hasMedia.value) return;
		const pm = playerManager();
		const positionSec = pm.getCurrentTimeSec();
		if (Number.isFinite(positionSec)) {
			store.positionMs.value = Math.max(0, positionSec * 1000);
		}
		const durationSec = pm.getDurationSec();
		const durationMs = Number.isFinite(durationSec) && durationSec > 0 ? durationSec * 1000 : 0;
		if (durationMs > 0 && durationMs !== store.durationMs.value) {
			store.durationMs.value = durationMs;
		}
	}, 500);
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

export function startCastController(): void {
	const ctx = context();
	const pm = playerManager();

	// The interceptors return `T | null` (null = swallow); the typed unions don't model
	// that mixed shape, hence the casts.
	pm.setMessageInterceptor(
		cast.framework.messages.MessageType.LOAD,
		interceptLoad as unknown as (data: LoadRequestData) => LoadRequestData,
	);
	pm.setMessageInterceptor(
		cast.framework.messages.MessageType.EDIT_TRACKS_INFO,
		interceptEditTracks as unknown as (data: EditTracksInfoRequestData) => EditTracksInfoRequestData,
	);

	wirePlayerEvents();
	startLoadingHeartbeat();
	startPositionTicker();
	// The engine reads the player clock directly so cue timing is finer than the 2 Hz UI tick.
	initSubtitleEngine(() => {
		try {
			const seconds = playerManager().getCurrentTimeSec();
			return Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : 0;
		} catch {
			return 0;
		}
	});
	initChannels();

	// System-level communication failures → error 666 to the phone.
	ctx.addEventListener(cast.framework.system.EventType.ERROR, () => {
		reportCastError(CastErrorCode.COMMUNICATION);
	});

	// When the last sender leaves, tear down to the idle screen instead of freezing on the
	// last frame (mirrors Terebi's eventCallback).
	ctx.addEventListener(cast.framework.system.EventType.SENDER_DISCONNECTED, () => {
		const senders = ctx.getSenders();
		if (senders.length === 0) {
			try {
				pm.stop();
			} catch {
				// Already idle.
			}
			setLoadedContentUrl(null);
			store.resetToIdle();
		}
	});

	const options = new cast.framework.CastReceiverOptions();
	// Route HLS through Shaka instead of CAF's legacy MPL pipeline. MPL rejects KAA-style
	// streams (TS segments disguised as .jpg, demuxed audio renditions) with opaque 31x errors;
	// Shaka determines the container from content, not extensions, and handles demuxed TS.
	options.useShakaForHls = true;
	// Pin a modern Shaka (CAF loads it from ajax.googleapis.com — availability verified with a
	// 200). The runtime-bundled default (~4.8) appends demuxed single-track TS without ever
	// producing buffered data on Chromecast — a SILENT failure. CAF's supported range is
	// 4.15.35 <= v < 5.0.0; 4.16.42 is the latest 4.16 line.
	options.shakaVersion = '4.16.42';
	options.customNamespaces = {
		[CONTROL_NAMESPACE]: cast.framework.system.MessageType.JSON,
		[HANDSHAKE_NAMESPACE]: cast.framework.system.MessageType.JSON,
		[ERROR_NAMESPACE]: cast.framework.system.MessageType.JSON,
		[CRASH_NAMESPACE]: cast.framework.system.MessageType.JSON,
	};

	// Network-layer proxy wrapping: media requests (manifest, sub-playlist, segment, license)
	// ride the phone proxy only when the current source is header-bound (store.currentHeaders,
	// carried as the wrapped request's `headers` parameter) or the target is plain http:// — the
	// gate lives inside wrapRequestUrl, which also fixes broken relative-URI resolution by
	// proxy-domain detection (never by extension). Manifest requests record the rescue's re-base
	// URL, hence the kind flag. The handlers read the store per request, so a proxyBaseUrl
	// learned later still applies.
	const playbackConfig = new cast.framework.PlaybackConfig();
	// forceTransmux is applied PER LOAD via setMediaPlaybackInfoHandler below: demuxed
	// single-track TS (the synthetic multi-audio master) needs Shaka's TS→fMP4 transmuxer, but
	// muxed TS must keep the platform's native mp2t path — forcing the transmuxer on it produces
	// gappy buffered ranges and stalls (LPayer regression).
	const wrapHandler = (kind: string) => (requestInfo: { url: string | null }): void => {
		if (requestInfo.url === null) return;
		const wrapped = wrapRequestUrl(requestInfo.url, kind === 'manifest');
		debugLog(`${kind} ${wrapped === requestInfo.url ? '(raw)' : '→proxy'} ${requestInfo.url}`);
		requestInfo.url = wrapped;
	};
	playbackConfig.manifestRequestHandler = wrapHandler('manifest');
	playbackConfig.segmentRequestHandler = wrapHandler('segment');
	playbackConfig.licenseRequestHandler = wrapHandler('license');
	options.playbackConfig = playbackConfig;

	// Per-load shaka tuning (see the comment on playbackConfig above). The store flag is written
	// by interceptLoad / switchSource before the load reaches playback.
	pm.setMediaPlaybackInfoHandler(((_load: unknown, config: PlaybackConfig) => {
		config.shakaConfig = { mediaSource: { forceTransmux: store.forceTransmux.value } };
		return config;
	}) as unknown as Parameters<typeof pm.setMediaPlaybackInfoHandler>[0]);

	// Play into OUR element instead of <cast-media-player>: the SDK attaches Shaka/MSE to whatever
	// media element it is given, and without the custom element there is no built-in UI to fight
	// (it has no suppression API). CAF would find the same element on its own — passing it is just
	// explicit.
	const mediaElement = findMediaElement();
	if (mediaElement !== null) {
		options.mediaElement = mediaElement;
		// Belt and braces: the second documented API for the same thing. If the SDK honours either, it
		// plays into our element and never needs a surface of its own.
		try {
			pm.setMediaElement(mediaElement);
		} catch (e) {
			debugLog(`setMediaElement failed - ${String(e)}`);
		}
	} else {
		debugLog('no <video> in the page — CAF will fall back to its own discovery');
	}

	// Tell the SDK the app draws its own interactive UI, so it skips the opaque full-screen TV scrim.
	const ui = (cast.framework as { ui?: typeof cast.framework.ui }).ui;
	if (ui?.UiConfig !== undefined) {
		const uiConfig = new ui.UiConfig();
		uiConfig.touchScreenOptimizedApp = true;
		options.uiConfig = uiConfig;
	}

	ctx.start(options);
	// After start(): drop CAF's default control-slot buttons and kill its shadow-DOM overlay.
	hideNativeUi();
	bindPlayerData();
}

/** Strong refs held for the session: a collected binder silently stops updating. */
const retainedForSession: unknown[] = [];

/**
 * Mirrors the SDK's own player state into the store through PlayerDataBinder — the documented state
 * feed now that we own the media element. It is authoritative for metadata and duration; the
 * PlayerManager listeners above stay because they also work under the dev shim and carry precise
 * ended/error detail that `PlayerData.state` cannot express. Overlapping writes are idempotent.
 */
function bindPlayerData(): void {
	// The dev shim fakes cast.framework without a `ui` namespace at all.
	const ui = (cast.framework as { ui?: typeof cast.framework.ui }).ui;
	if (ui?.PlayerDataBinder === undefined) {
		debugLog('PlayerDataBinder unavailable (dev shim) — using PlayerManager events only');
		return;
	}
	try {
		const binder = new ui.PlayerDataBinder({});
		retainedForSession.push(binder);
		const Event = ui.PlayerDataEventType;

		binder.addEventListener(Event.TITLE_CHANGED, (event) => {
			store.title.value = typeof event.value === 'string' ? event.value : '';
		});
		// SUBTITLE_CHANGED exists in the enum even though PlayerData declares no `subtitle` field —
		// the binder writes it at runtime; this is the episode label under the title.
		binder.addEventListener(Event.SUBTITLE_CHANGED, (event) => {
			store.episodeLabelText.value = typeof event.value === 'string' ? event.value : '';
		});
		binder.addEventListener(Event.DURATION_CHANGED, (event) => {
			const seconds = typeof event.value === 'number' ? event.value : 0;
			store.durationMs.value = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
		});
		binder.addEventListener(Event.STATE_CHANGED, (event) => {
			const flags = playbackFlagsFor(String(event.value));
			debugLog(`state ${String(event.value)}`);
			if (flags.isPlaying !== null) store.isPlaying.value = flags.isPlaying;
			if (flags.buffering !== null) store.buffering.value = flags.buffering;
			if (flags.clearLoading) store.setLoading(false);
		});
	} catch (e) {
		debugLog(`PlayerDataBinder failed - ${String(e)}`);
	}
}
