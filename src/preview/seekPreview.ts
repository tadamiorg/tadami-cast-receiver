/**
 * Seekbar preview wiring: the PreviewController fed from the store (current stream, the phone's
 * `seekPreview` announcement, duration) and exposed to the UI as one signal. The seek bar and the
 * quick-seek overlay call previewScrub/previewEnd; channels.ts plugs in the control-channel sender
 * (initSeekPreview) and forwards `previewFrame`s (handlePreviewFrame). The current stream is
 * announced to the phone (`previewSource`) whenever it changes, so the phone prefetches its frames.
 */

import { effect, signal } from '@preact/signals';
import {
	PREVIEW_SOURCE_TYPE,
	type PreviewFrameMessage,
	type PreviewRequestMessage,
	type PreviewSourceMessage,
	type StreamSource,
} from '../cast/protocol';
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

/** Identity of the stream the TV plays, for the phone's cache and the stale-reply check. */
export function previewSourceFor(episodeId: number, source: StreamSource): PreviewSource {
	return {
		id: `${episodeId}|${source.url}|${source.server}|${source.quality}`,
		url: source.url,
		headers: source.headers,
	};
}

let send: (message: PreviewRequestMessage | PreviewSourceMessage) => void = () => undefined;
let scrubPositionMs: number | null = null;
/** The stream last announced to the phone (null: none yet, or reset). */
let announcedId: string | null = null;

const controller = new PreviewController({
	send: (request) => send(request),
	onChange: () => refresh(),
});

/** Plugs in the control-channel sender (channels.ts, before context.start()). */
export function initSeekPreview(sender: (message: PreviewRequestMessage | PreviewSourceMessage) => void): void {
	send = sender;
}

function syncSource(): void {
	const source = store.sources.peek()[store.selectedSourceIndex.peek()];
	controller.setSource(
		source !== undefined && source.url !== '' ? previewSourceFor(store.currentEpisodeId.peek(), source) : null,
		store.seekPreview.peek(),
	);
}

/**
 * Tells the phone which stream the TV plays, so it prefetches and pushes its frames: once per stream,
 * or again when [force]d (a phone connected or restarted: it may have lost its frames). Nothing when
 * the phone makes no preview or the duration isn't known yet.
 */
export function announcePreviewSource(force = false): void {
	syncSource();
	const source = controller.currentSource;
	const durationMs = store.durationMs.peek();
	if (source === null || !controller.available || !(durationMs > 0)) return;
	if (!force && source.id === announcedId) return;
	announcedId = source.id;
	send({
		type: PREVIEW_SOURCE_TYPE,
		sourceId: source.id,
		url: source.url,
		headers: source.headers,
		duration: Math.round(durationMs),
		steps: controller.answeredSteps,
	});
}

// A new stream (LOAD, source switch) is announced once its duration is known.
effect(() => {
	void store.seekPreview.value;
	void store.durationMs.value;
	void store.sources.value;
	void store.selectedSourceIndex.value;
	void store.currentEpisodeId.value;
	announcePreviewSource();
});

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

/** A `previewFrame` from the phone (a reply or a prefetched frame); one about another stream is dropped. */
export function handlePreviewFrame(message: PreviewFrameMessage): void {
	// Prefetched frames can come before any scrub: the controller must know the current stream
	syncSource();
	controller.onFrame(message);
}

/** New LOAD, source switch or teardown: the frames belong to the previous stream. */
export function resetPreview(): void {
	controller.reset();
	announcedId = null;
	refresh();
}
