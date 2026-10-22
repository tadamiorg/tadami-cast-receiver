/**
 * Central player state as @preact/signals — a signals port of Terebi's
 * `PlayerManager.Snapshot`. Components subscribe to exactly the signals they read, so the
 * high-frequency 500 ms `positionMs` ticker only re-renders the seek bar row (Terebi keeps
 * position out of its StateFlow snapshot for the same reason).
 */

import { computed, signal } from '@preact/signals';
import {
	DEFAULT_SUBTITLE_STYLE,
	findEpisodeIndex,
	hasNextEpisode,
	hasPreviousEpisode,
	type CastSubtitleStyle,
	type AudioTrack,
	type StreamSource,
	type SubtitleTrack,
	type TvEpisode,
	type TvThemeColors,
} from '../cast/protocol';

// --- Media / metadata -------------------------------------------------------

export const hasMedia = signal(false);
export const title = signal('');
export const episodeLabelText = signal('');

// --- Playback state ---------------------------------------------------------

export const isPlaying = signal(false);
/** Playback reached the end — the UI shows a replay control. */
export const ended = signal(false);
/** Mid-playback rebuffer (bare spinner, keeps the last frame visible). */
export const buffering = signal(false);
/** A source/episode switch or first load is in progress (scrimmed spinner). */
export const loading = signal(false);
export const loadingLabel = signal('');
export const durationMs = signal(0);

/**
 * High-frequency playback position (ms), fed by a 500 ms ticker. Deliberately isolated
 * from everything else so only position readers (SeekBarRow) re-render.
 */
export const positionMs = signal(0);

// --- Sources / tracks -------------------------------------------------------

export const sources = signal<StreamSource[]>([]);
export const selectedSourceIndex = signal(-1);
/**
 * Headers of the CURRENT source (null/empty = none). Both the proxy gate ("does this source need
 * the phone?") and the values carried in every wrapped request's `headers` parameter. Written
 * wherever selectedSourceIndex is (LOAD intercept, source switch); read by wrapRequestUrl.
 */
export const currentHeaders = signal<Record<string, string> | null>(null);
/**
 * Full URL of the last manifest request — the re-base target for the proxy-domain rescue: a
 * relative manifest URI resolved against a proxied manifest URL lands on the proxy origin and is
 * re-resolved against this URL (the modern `hlsUrl` of the old receiver's UrlGenerator).
 */
export const lastManifestUrl = signal<string | null>(null);
/**
 * The CURRENT load plays demuxed single-track TS via the synthetic multi-audio master and needs
 * Shaka's TS transmuxer (applied per-load through setMediaPlaybackInfoHandler). Everything else
 * must keep the platform's NATIVE mp2t path: forcing the transmuxer on muxed TS produces gappy
 * buffered ranges and stalls (LPayer regression).
 */
export const forceTransmux = signal(false);
/** Subtitle tracks of the CURRENT source, as RAW urls; the subtitle engine wraps them through the proxy at fetch time. */
export const subtitles = signal<SubtitleTrack[]>([]);
/** null = subtitles off. */
export const selectedSubtitleIndex = signal<number | null>(null);
/**
 * The chosen subtitle *language* (null = off). Sources order their tracks differently, so
 * a source switch re-resolves the index from this language instead of reusing a stale index.
 */
export const selectedSubtitleLang = signal<string | null>(null);
export const audioTracks = signal<AudioTrack[]>([]);
export const selectedAudioIndex = signal(0);

// --- Episodes ---------------------------------------------------------------

/** DESCENDING order — "next" = index-1, "previous" = index+1. */
export const episodes = signal<TvEpisode[]>([]);
export const displayMode = signal('NUMBER');
export const currentEpisodeId = signal(0);

export const currentEpisodeIndex = computed(() =>
	findEpisodeIndex(episodes.value, currentEpisodeId.value),
);
export const hasNext = computed(() => hasNextEpisode(currentEpisodeIndex.value));
export const hasPrevious = computed(() =>
	hasPreviousEpisode(currentEpisodeIndex.value, episodes.value.length),
);

// --- Theme / subtitle style -------------------------------------------------

export const theme = signal<TvThemeColors | null>(null);
export const subtitleStyle = signal<CastSubtitleStyle>(DEFAULT_SUBTITLE_STYLE);

// --- Session-level ----------------------------------------------------------

/** Phone-local proxy base URL, from LOAD customData and/or handshake messages. */
export const proxyBaseUrl = signal<string | null>(null);
export const userAgent = signal<string | null>(null);
/** The phone makes seekbar preview frames for the current load (LOAD customData `seekPreview`). */
export const seekPreview = signal(false);

/** Non-null blocks the whole UI with a protocol-mismatch notice (error 104 flow). */
export const blockingNotice = signal<string | null>(null);

// --- Helpers ----------------------------------------------------------------

export function setLoading(value: boolean, label = ''): void {
	loading.value = value;
	loadingLabel.value = value ? label : '';
}

/** Full teardown back to the idle screen (sender disconnected / media removed). */
export function resetToIdle(): void {
	hasMedia.value = false;
	title.value = '';
	episodeLabelText.value = '';
	isPlaying.value = false;
	ended.value = false;
	buffering.value = false;
	setLoading(false);
	durationMs.value = 0;
	positionMs.value = 0;
	sources.value = [];
	selectedSourceIndex.value = -1;
	currentHeaders.value = null;
	lastManifestUrl.value = null;
	forceTransmux.value = false;
	subtitles.value = [];
	selectedSubtitleIndex.value = null;
	selectedSubtitleLang.value = null;
	audioTracks.value = [];
	selectedAudioIndex.value = 0;
	episodes.value = [];
	displayMode.value = 'NUMBER';
	currentEpisodeId.value = 0;
	seekPreview.value = false;
}
