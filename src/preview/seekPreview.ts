/**
 * Seekbar preview wiring: the PreviewController fed from the store (current stream, the phone's
 * `seekPreview` announcement, duration) and exposed to the UI as one signal. The seek bar and the
 * quick-seek overlay call previewScrub/previewEnd; channels.ts plugs in the control-channel sender
 * (initSeekPreview) and forwards `previewFrame` replies (handlePreviewFrame).
 */

import { signal } from '@preact/signals';
import type { PreviewFrameMessage, PreviewRequestMessage, StreamSource } from '../cast/protocol';
import * as store from '../player/store';
import { PreviewController, type PreviewSource } from './previewController';

/** What the preview card shows while scrubbing: the time, with the step's frame when there is one. */
export interface PreviewView {
	positionMs: number;
	/** Image URL of the step's frame; null while it loads or when it has none (time only). */
	frame: string | null;
}

/** Null when nothing is scrubbed or the phone makes no preview (the UI then stays as without previews). */
export const previewView = signal<PreviewView | null>(null);

/**
 * How long a scrub waits after the last key press before seeking, when the phone makes previews: long
 * enough to see the frame it sends (a few hundred ms to decode on the phone). Without previews the
 * seek bar and the quick seek keep their own shorter delays. Enter still seeks at once.
 */
export const PREVIEW_SCRUB_COMMIT_MS = 1_500;

/** Identity of the stream the TV plays, for the phone's cache and the stale-reply check. */
export function previewSourceFor(episodeId: number, source: StreamSource): PreviewSource {
	return {
		id: `${episodeId}|${source.url}|${source.server}|${source.quality}`,
		url: source.url,
		headers: source.headers,
	};
}

let send: (request: PreviewRequestMessage) => void = () => undefined;
let scrubPositionMs: number | null = null;

const controller = new PreviewController({
	send: (request) => send(request),
	onChange: () => refresh(),
});

/** Whether a scrub now holds its seek for PREVIEW_SCRUB_COMMIT_MS: the phone makes previews for this load. */
export function previewHoldsCommit(): boolean {
	return store.seekPreview.peek() && !controller.isOff;
}

/** Plugs in the control-channel sender (channels.ts, before context.start()). */
export function initSeekPreview(sender: (request: PreviewRequestMessage) => void): void {
	send = sender;
}

function syncSource(): void {
	const source = store.sources.peek()[store.selectedSourceIndex.peek()];
	controller.setSource(
		source !== undefined && source.url !== '' ? previewSourceFor(store.currentEpisodeId.peek(), source) : null,
		store.seekPreview.peek(),
	);
}

function refresh(): void {
	const positionMs = scrubPositionMs;
	if (positionMs === null || !controller.available) {
		previewView.value = null;
		return;
	}
	const entry = controller.entryFor(positionMs, store.durationMs.peek());
	previewView.value = { positionMs, frame: entry?.kind === 'frame' ? entry.src : null };
}

/** The user scrubs to [positionMs] (seek bar or quick seek): shows its step, asking the phone if needed. */
export function previewScrub(positionMs: number): void {
	scrubPositionMs = positionMs;
	syncSource();
	controller.aim(positionMs, store.durationMs.peek());
	refresh();
}

/** Scrubbing ended (committed or abandoned). */
export function previewEnd(): void {
	scrubPositionMs = null;
	controller.end();
	refresh();
}

/** A `previewFrame` reply from the phone; one about another stream is dropped. */
export function handlePreviewFrame(message: PreviewFrameMessage): void {
	controller.onFrame(message);
}

/** New LOAD, source switch or teardown: the frames belong to the previous stream. */
export function resetPreview(): void {
	controller.reset();
	refresh();
}
