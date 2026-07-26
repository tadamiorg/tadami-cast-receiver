/**
 * Player overlay state machine — the web port of Terebi's PlaybackScreen composable:
 *  - controls auto-hide after 5 s of inactivity (never while a dialog is open or ended),
 *    any key "pokes" the timer, BACK hides, UP on the transport row hides;
 *  - hidden-controls quick-seek: LEFT/RIGHT accumulate ±10 s, committed 500 ms after the
 *    last press; Enter commits immediately; any other key surfaces the controls;
 *  - dialogs (source / episodes / subtitles / audio);
 *  - loading & buffering overlays drawn above the controls, below the dialogs.
 */

import { effect, signal } from '@preact/signals';
import * as store from '../player/store';
import * as tracks from '../player/tracks';
import { sendNext, sendPrevious, sendSelectEpisode } from '../cast/channels';
import { isBackKey, isEnterKey } from './focus';
import { ControlsScrim } from './ControlsScrim';
import { LoadingOverlay, BufferingSpinner } from './LoadingOverlay';
import { QuickSeekOverlay } from './QuickSeekOverlay';
import { AudioDialog, EpisodeDialog, SourceDialog, SubtitleDialog } from './dialogs/SelectionDialogs';

const SKIP_OP_MS = 85_000;
const SEEK_STEP_MS = 10_000;
const SEEK_STEP_S = SEEK_STEP_MS / 1000;
const CONTROLS_TIMEOUT_MS = 5_000;
/** Quick-seek commit debounce (hidden controls). */
const QUICK_SEEK_COMMIT_MS = 500;

type DialogKind = 'source' | 'episode' | 'subtitle' | 'audio' | null;

const controlsVisible = signal(true);
const openDialog = signal<DialogKind>(null);
const quickSeekMs = signal<number | null>(null);
const quickSeekAccumSec = signal(0);

// ---------------------------------------------------------------------------
// Auto-hide timer ("pokes" reset it without re-rendering anything)
// ---------------------------------------------------------------------------

let hideTimer: ReturnType<typeof setTimeout> | null = null;

function armHideTimer(): void {
	if (hideTimer !== null) clearTimeout(hideTimer);
	hideTimer = null;
	if (controlsVisible.peek() && openDialog.peek() === null && !store.ended.peek()) {
		hideTimer = setTimeout(() => {
			controlsVisible.value = false;
		}, CONTROLS_TIMEOUT_MS);
	}
}

function poke(): void {
	armHideTimer();
}

function showControls(): void {
	controlsVisible.value = true;
	poke();
}

function hideControls(): void {
	controlsVisible.value = false;
	if (hideTimer !== null) clearTimeout(hideTimer);
	hideTimer = null;
}

// Re-arm whenever visibility / dialog / ended changes.
effect(() => {
	void controlsVisible.value;
	void openDialog.value;
	void store.ended.value;
	armHideTimer();
});

// Surface the controls whenever a new title/episode/source starts playing, or at end of
// stream (replay button).
effect(() => {
	void store.episodeLabelText.value;
	void store.selectedSourceIndex.value;
	if (store.hasMedia.value) showControls();
});
effect(() => {
	if (store.ended.value) showControls();
});

// Focus routing: dialogs self-focus; otherwise play/pause when visible, nothing when hidden.
effect(() => {
	const visible = controlsVisible.value;
	const dialog = openDialog.value;
	const has = store.hasMedia.value;
	setTimeout(() => {
		if (!has || dialog !== null) return;
		if (visible) {
			document.querySelector<HTMLElement>('[data-play-focus]')?.focus();
		} else if (document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
	}, 50);
});

// ---------------------------------------------------------------------------
// Hidden-controls quick-seek
// ---------------------------------------------------------------------------

let quickSeekCommitTimer: ReturnType<typeof setTimeout> | null = null;

function commitQuickSeek(): void {
	if (quickSeekCommitTimer !== null) clearTimeout(quickSeekCommitTimer);
	quickSeekCommitTimer = null;
	const target = quickSeekMs.peek();
	if (target !== null) tracks.seekTo(target);
	quickSeekMs.value = null;
	quickSeekAccumSec.value = 0;
}

function quickSeek(sign: 1 | -1): void {
	const duration = store.durationMs.peek();
	const base = quickSeekMs.peek() ?? Math.max(0, store.positionMs.peek());
	quickSeekMs.value =
		sign > 0 ? Math.min(base + SEEK_STEP_MS, duration) : Math.max(base - SEEK_STEP_MS, 0);
	const accum = quickSeekAccumSec.peek();
	quickSeekAccumSec.value =
		sign > 0
			? accum < 0
				? SEEK_STEP_S
				: accum + SEEK_STEP_S
			: accum > 0
				? -SEEK_STEP_S
				: accum - SEEK_STEP_S;
	if (quickSeekCommitTimer !== null) clearTimeout(quickSeekCommitTimer);
	quickSeekCommitTimer = setTimeout(commitQuickSeek, QUICK_SEEK_COMMIT_MS);
}

// ---------------------------------------------------------------------------
// Preview key interceptor (registered with focus.ts from main.tsx)
// ---------------------------------------------------------------------------

export function overlayKeyInterceptor(event: KeyboardEvent): boolean {
	if (store.blockingNotice.value !== null) return false;
	if (!store.hasMedia.value) return false;
	if (openDialog.value !== null) return false; // DialogScaffold handles its own keys

	if (isBackKey(event)) {
		if (controlsVisible.value) {
			hideControls();
		} else {
			commitQuickSeek();
			showControls();
		}
		return true;
	}

	if (controlsVisible.value) {
		// UP on the transport row collapses the controls (Terebi's ControlsScrim).
		if (
			event.key === 'ArrowUp' &&
			document.activeElement instanceof HTMLElement &&
			document.activeElement.closest('[data-up-dismiss]') !== null
		) {
			hideControls();
			return true;
		}
		poke(); // reset the auto-hide timer; let navigation/elements handle the key
		return false;
	}

	// Controls hidden: LEFT/RIGHT quick-seek, Enter commits/opens, other keys open.
	const seekable = store.durationMs.value > 0;
	switch (event.key) {
		case 'ArrowRight':
			if (seekable) quickSeek(1);
			else showControls();
			return true;
		case 'ArrowLeft':
			if (seekable) quickSeek(-1);
			else showControls();
			return true;
		default:
			if (isEnterKey(event)) {
				if (quickSeekMs.value !== null) commitQuickSeek();
				else showControls();
			} else {
				commitQuickSeek();
				showControls();
			}
			return true;
	}
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function onNext(): void {
	sendNext(store.positionMs.value, store.durationMs.value);
	store.setLoading(true, 'Loading episode…');
}

function onPrevious(): void {
	sendPrevious(store.positionMs.value, store.durationMs.value);
	store.setLoading(true, 'Loading episode…');
}

function onSelectEpisode(episodeId: number): void {
	openDialog.value = null;
	sendSelectEpisode(episodeId, store.positionMs.value, store.durationMs.value);
	store.setLoading(true, 'Loading episode…');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PlayerOverlay() {
	if (!store.hasMedia.value) return null;

	const dialog = openDialog.value;
	const visible = controlsVisible.value;

	return (
		<>
			{visible && dialog === null && (
				<ControlsScrim
					onPlayPause={() => {
						tracks.playPause();
						poke();
					}}
					onReplay={() => {
						tracks.replay();
						poke();
					}}
					onSkipOp={() => {
						tracks.seekBy(SKIP_OP_MS);
						poke();
					}}
					onSeek={(ms) => {
						tracks.seekTo(ms);
						poke();
					}}
					onNext={onNext}
					onPrevious={onPrevious}
					onSources={() => (openDialog.value = 'source')}
					onSubtitles={() => (openDialog.value = 'subtitle')}
					onAudio={() => (openDialog.value = 'audio')}
					onEpisodes={() => (openDialog.value = 'episode')}
				/>
			)}

			{!visible && quickSeekMs.value !== null && (
				<QuickSeekOverlay
					accumSec={quickSeekAccumSec.value}
					positionMs={quickSeekMs.value ?? store.positionMs.value}
				/>
			)}

			{store.loading.value ? <LoadingOverlay /> : store.buffering.value ? <BufferingSpinner /> : null}

			{dialog === 'source' && (
				<SourceDialog
					sources={store.sources.value}
					selectedIndex={store.selectedSourceIndex.value}
					onSelect={(index) => {
						openDialog.value = null;
						tracks.switchSource(index);
					}}
					onDismiss={() => (openDialog.value = null)}
				/>
			)}

			{dialog === 'episode' && (
				<EpisodeDialog
					episodes={store.episodes.value}
					displayMode={store.displayMode.value}
					currentEpisodeId={store.currentEpisodeId.value}
					onSelect={onSelectEpisode}
					onDismiss={() => (openDialog.value = null)}
				/>
			)}

			{dialog === 'subtitle' && (
				<SubtitleDialog
					tracks={store.subtitles.value}
					selectedIndex={store.selectedSubtitleIndex.value}
					onSelect={(index) => {
						openDialog.value = null;
						tracks.selectSubtitle(index);
					}}
					onDismiss={() => (openDialog.value = null)}
				/>
			)}

			{dialog === 'audio' && (
				<AudioDialog
					tracks={store.audioTracks.value}
					selectedIndex={store.selectedAudioIndex.value}
					onSelect={(index) => {
						openDialog.value = null;
						tracks.selectAudio(index);
					}}
					onDismiss={() => (openDialog.value = null)}
				/>
			)}
		</>
	);
}
