/**
 * `cast.framework.ui.State` → our store flags, kept pure so the PlayerDataBinder wiring stays thin
 * and the mapping is testable without a CAF runtime.
 *
 * `PlayerData` exposes NO `isPlaying`/`isPaused`/`isBuffering` fields — playback state is only the
 * single `state` enum — so every flag we keep has to be derived from it. `null` means "this state
 * says nothing about that flag, leave the signal alone" (e.g. buffering mid-playback must not clear
 * isPlaying).
 */

export interface PlaybackFlags {
	isPlaying: boolean | null;
	buffering: boolean | null;
	/** The load finished visibly enough to drop the scrimmed spinner. */
	clearLoading: boolean;
}

export function playbackFlagsFor(state: string): PlaybackFlags {
	switch (state) {
		case 'playing':
			return { isPlaying: true, buffering: false, clearLoading: true };
		case 'paused':
			return { isPlaying: false, buffering: false, clearLoading: true };
		case 'buffering':
			// Mid-playback rebuffer: only the bare spinner, isPlaying is still meaningful.
			return { isPlaying: null, buffering: true, clearLoading: false };
		case 'loading':
			return { isPlaying: null, buffering: false, clearLoading: false };
		case 'idle':
			return { isPlaying: false, buffering: false, clearLoading: true };
		default:
			// 'launching' and anything a future SDK adds: don't touch the UI.
			return { isPlaying: null, buffering: null, clearLoading: false };
	}
}
