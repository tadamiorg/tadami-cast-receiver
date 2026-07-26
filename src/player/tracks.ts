/**
 * Receiver-local playback actions: play/pause/seek/replay, subtitle & audio selection and
 * source switching — the web equivalents of Terebi's PlayerManager methods. Any local
 * selection change broadcasts a `state` control message so the phone UI mirrors it.
 */

import type { PlayerManager } from 'chromecast-caf-receiver/cast.framework';
import type { Track } from 'chromecast-caf-receiver/cast.framework.messages';
import { sendSave, sendState } from '../cast/channels';
import { reportCastError } from '../cast/errorReporter';
import { debugLog } from '../cast/debug';
import { CastErrorCode } from '../cast/protocol';
import { allAudioHls, audioLanguageTags, playbackForSource } from './hlsMaster';
import * as store from './store';
import { setSubtitleTrack } from './subtitles/subtitleEngine';

function playerManager(): PlayerManager {
	return cast.framework.CastReceiverContext.getInstance().getPlayerManager();
}

/** URL of the media currently prepared/playing — used to ignore duplicate LOADs. */
let loadedContentUrl: string | null = null;

export function getLoadedContentUrl(): string | null {
	return loadedContentUrl;
}

export function setLoadedContentUrl(url: string | null): void {
	loadedContentUrl = url;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export function playPause(): void {
	const pm = playerManager();
	if (store.isPlaying.value) pm.pause();
	else pm.play();
}

export function seekTo(ms: number): void {
	const clamped = Math.max(0, ms);
	playerManager().seek(clamped / 1000);
	store.positionMs.value = clamped;
}

export function seekBy(deltaMs: number): void {
	const currentMs = Math.max(0, (playerManager().getCurrentTimeSec() || 0) * 1000);
	seekTo(currentMs + deltaMs);
}

/** Restart the finished stream from the beginning (reloads when CAF already went IDLE). */
export function replay(): void {
	const pm = playerManager();
	if (pm.getPlayerState() !== cast.framework.messages.PlayerState.IDLE) {
		pm.seek(0);
		pm.play();
		store.ended.value = false;
		return;
	}
	const source = store.sources.value[store.selectedSourceIndex.value];
	if (source === undefined) return;
	const target = playbackForSource(source);
	store.ended.value = false;
	store.setLoading(true, 'Loading…');
	localLoad(target.url, 0, true, target.contentType);
}

// ---------------------------------------------------------------------------
// Subtitles
// ---------------------------------------------------------------------------

/** Terebi's language matcher, simplified: case-insensitive full match or base-tag match. */
export function matchesSubtitleLang(a: string, b: string): boolean {
	const na = a.trim().toLowerCase();
	const nb = b.trim().toLowerCase();
	if (na === '' || nb === '') return na === nb;
	if (na === nb) return true;
	const baseA = na.split(/[-_\s(]/, 1)[0];
	const baseB = nb.split(/[-_\s(]/, 1)[0];
	return baseA === baseB;
}

/** Receiver-local subtitle switch by index into the current source's list (null = off). */
export function selectSubtitle(index: number | null, emit = true): void {
	const track = index !== null ? (store.subtitles.value[index] ?? null) : null;
	if (index !== null && track === null) {
		debugLog(`subtitle: index #${index} not in list of ${store.subtitles.value.length} -> off`);
	}
	const effective = track !== null ? index : null;
	store.selectedSubtitleIndex.value = effective;
	// Remember the language so it carries across source switches (null = off).
	store.selectedSubtitleLang.value = track?.lang ?? null;
	void setSubtitleTrack(track);
	if (emit) emitState();
}

/** Applies the stored subtitle selection without touching the remembered language. */
export function applySubtitleSelection(): void {
	const index = store.selectedSubtitleIndex.value;
	void setSubtitleTrack(index !== null ? (store.subtitles.value[index] ?? null) : null);
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

/**
 * Receiver-local audio switch by index into the source's audioTracks, applied in place via
 * AudioTracksManager — no reload. Selection resolves through the rendition's LANGUAGE tag
 * (see applyAudioSelection).
 */
export function selectAudio(index: number, emit = true): void {
	if (index === store.selectedAudioIndex.value) return;
	if (store.audioTracks.value[index] === undefined) return;
	store.selectedAudioIndex.value = index;
	applyAudioSelection();
	if (emit) emitState();
}

export function applyAudioSelection(): void {
	const external = store.audioTracks.value;
	const index = store.selectedAudioIndex.value;
	if (external.length === 0 || index < 0) return;
	try {
		const manager = playerManager().getAudioTracksManager();
		const castTracks = manager.getTracks();
		if (castTracks.length === 0) {
			debugLog(`audio: no CAF tracks yet (wanted #${index})`);
			return;
		}
		// Match the LANGUAGE tag the synthetic master gave this rendition: CAF switches audio by
		// calling shaka's selectAudioLanguage(track.language), so the tag — not the position — is
		// what actually moves the audio. Rendition order stays as the fallback (muxed streams,
		// where the tracks come from the stream itself rather than our master).
		const wantedTag = audioLanguageTags(external)[index];
		const target: Track | undefined =
			castTracks.find(
				(t) => typeof t.language === 'string' && t.language.toLowerCase() === wantedTag,
			) ?? castTracks[index];
		debugLog(
			`audio: want #${index} lang=${wantedTag} caf=[${castTracks
				.map((t) => `${t.trackId}:${t.language ?? '?'}`)
				.join(',')}] -> ${target?.trackId ?? 'none'}`,
		);
		if (target !== undefined) manager.setActiveById(target.trackId);
	} catch (e) {
		// No media / no audio tracks manager yet — PLAYER_LOAD_COMPLETE re-applies.
		debugLog(`audio: apply failed - ${String(e)}`);
	}
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/**
 * Receiver-local source switch: persist watch time phone-side, reload the source's playback
 * URL at the current position (proxied only when THIS source is header-bound — needsProxy
 * follows the selection), re-resolve the subtitle by *language* (track order differs per
 * source) and broadcast the new selection state. Subtitle URLs stay RAW — the engine wraps
 * them at fetch time.
 */
export function switchSource(index: number): void {
	const source = store.sources.value[index];
	if (source === undefined) return;
	const pm = playerManager();
	const positionMs = Math.max(0, (pm.getCurrentTimeSec() || 0) * 1000);

	// Persist watch time on the phone before the receiver-local switch.
	sendSave(positionMs, store.durationMs.value);

	store.selectedSourceIndex.value = index;
	store.currentHeaders.value = source.headers;
	store.lastManifestUrl.value = source.url !== '' ? source.url : null;
	store.forceTransmux.value = allAudioHls(source.audioTracks);
	store.subtitles.value = source.subtitleTracks.map((track) => ({ ...track }));
	store.audioTracks.value = source.audioTracks;
	if (store.selectedAudioIndex.value >= source.audioTracks.length) {
		store.selectedAudioIndex.value = 0;
	}

	// Re-resolve the chosen subtitle by language for THIS source. Names drift between servers
	// ("Italian" vs "Italiano"), so a miss must NOT silently disable subtitles: keep the same
	// position when it still exists in the new list.
	const lang = store.selectedSubtitleLang.value;
	if (lang !== null) {
		const byLang = source.subtitleTracks.findIndex((t) => matchesSubtitleLang(t.lang, lang));
		if (byLang >= 0) {
			store.selectedSubtitleIndex.value = byLang;
		} else {
			const kept = store.selectedSubtitleIndex.value;
			const fallback = kept !== null && kept < source.subtitleTracks.length ? kept : null;
			debugLog(`subtitle: lang "${lang}" absent in new source -> ${fallback ?? 'off'}`);
			store.selectedSubtitleIndex.value = fallback;
			store.selectedSubtitleLang.value =
				fallback !== null ? (source.subtitleTracks[fallback]?.lang ?? null) : null;
		}
	} else {
		store.selectedSubtitleIndex.value = null;
	}
	applySubtitleSelection();

	store.ended.value = false;
	store.setLoading(true, 'Switching source…');
	const target = playbackForSource(source);
	localLoad(target.url, positionMs / 1000, true, target.contentType);
	emitState();
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/** Broadcast the current source/subtitle/audio selection so the phone UI mirrors it. */
export function emitState(): void {
	sendState(
		store.selectedSourceIndex.value,
		store.selectedSubtitleIndex.value,
		store.selectedAudioIndex.value,
	);
}

/**
 * Receiver-initiated load (source switch / replay). Carries no Tadami customData, which the
 * LOAD interceptor uses to tell it apart from a phone LOAD (passthrough).
 */
export function localLoad(url: string, startSec: number, autoplay: boolean, contentType?: string): void {
	const request = new cast.framework.messages.LoadRequestData();
	const media = new cast.framework.messages.MediaInformation();
	media.contentId = url;
	media.contentUrl = url;
	if (contentType !== undefined) media.contentType = contentType;
	media.streamType = cast.framework.messages.StreamType.BUFFERED;
	const metadata = new cast.framework.messages.GenericMediaMetadata();
	metadata.title = store.title.value;
	metadata.subtitle = store.episodeLabelText.value;
	media.metadata = metadata;
	request.media = media;
	request.currentTime = Math.max(0, startSec);
	request.autoplay = autoplay;
	Promise.resolve(playerManager().load(request)).catch(() => {
		reportCastError(CastErrorCode.LOAD_FAILED);
		store.setLoading(false);
	});
}
