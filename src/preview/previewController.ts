/**
 * Receiver side of the seekbar preview: which frame to ask the phone for, and the frames it sent.
 * Pure (no `cast.*`, no DOM) so it is unit-testable; seekPreview.ts wires it to the store and the
 * control channel.
 *
 * Mirrors the phone player's preview (SeekPreviewPlayer / BucketRequests): frames are cached per
 * stream by preview step; only the step under the scrub position is asked for, one request at a
 * time, never a step already answered (a frame, or "none" — the phone gave up on it). Another stream
 * (new LOAD, source switch) drops everything, and replies about another stream are ignored.
 */

import {
	PREVIEW_REQUEST_TYPE,
	type PreviewFrameMessage,
	type PreviewRequestMessage,
} from '../cast/protocol';
import { previewStepOf } from './previewSteps';

/** The stream the TV plays, as the request carries it. [id] changes with the episode and the source. */
export interface PreviewSource {
	id: string;
	url: string;
	headers: Record<string, string> | null;
}

/** A step's answer: its frame (an image URL), or no frame to show. */
export type PreviewEntry = { kind: 'frame'; src: string } | { kind: 'none' };

export interface PreviewControllerOptions {
	send: (request: PreviewRequestMessage) => void;
	/** Something the UI shows changed (a frame arrived, previews went off). */
	onChange?: () => void;
	/** A request the phone never answered is given up after this long (the phone's own limit is 10 s). */
	timeoutMs?: number;
	/** Cached steps kept at most, least recently used dropped first. */
	maxEntries?: number;
}

export const PREVIEW_REQUEST_TIMEOUT_MS = 15_000;
export const PREVIEW_MAX_ENTRIES = 300;

interface InFlight {
	requestId: number;
	step: number;
	timer: ReturnType<typeof setTimeout>;
}

export class PreviewController {
	private readonly send: (request: PreviewRequestMessage) => void;
	private readonly onChange: () => void;
	private readonly timeoutMs: number;
	private readonly maxEntries: number;

	private source: PreviewSource | null = null;
	private enabled = false;
	/** The phone said this stream has no preview at all. */
	private off = false;
	private readonly entries = new Map<number, PreviewEntry>();
	private inFlight: InFlight | null = null;
	private target: { step: number; durationMs: number } | null = null;
	private nextRequestId = 1;

	constructor(options: PreviewControllerOptions) {
		this.send = options.send;
		this.onChange = options.onChange ?? (() => undefined);
		this.timeoutMs = options.timeoutMs ?? PREVIEW_REQUEST_TIMEOUT_MS;
		this.maxEntries = options.maxEntries ?? PREVIEW_MAX_ENTRIES;
	}

	/**
	 * The stream to preview and whether the phone makes frames for it (its LOAD announced
	 * `seekPreview`). Another stream than the current one drops every frame and the request in flight.
	 */
	setSource(source: PreviewSource | null, enabled: boolean): void {
		if (source?.id !== this.source?.id) {
			this.reset();
			this.source = source;
		}
		this.enabled = enabled;
	}

	/** Drops the stream, its frames and the request in flight (new LOAD, source switch, idle). */
	reset(): void {
		if (this.inFlight !== null) clearTimeout(this.inFlight.timer);
		this.inFlight = null;
		this.entries.clear();
		this.target = null;
		this.off = false;
		this.source = null;
	}

	/** The phone said the current stream has no preview at all. */
	get isOff(): boolean {
		return this.off;
	}

	/** Previews can show for the current stream. */
	get available(): boolean {
		return this.enabled && !this.off && this.source !== null;
	}

	/** Requests in flight: 0 or 1. */
	get pendingRequests(): number {
		return this.inFlight === null ? 0 : 1;
	}

	get cachedSteps(): number {
		return this.entries.size;
	}

	/** The scrub position is [positionMs]: asks for its step unless answered or in flight. */
	aim(positionMs: number, durationMs: number): void {
		if (!this.available || !(durationMs > 0)) {
			this.target = null;
			return;
		}
		this.target = { step: previewStepOf(positionMs, durationMs), durationMs: Math.round(durationMs) };
		this.pump();
	}

	/** Scrubbing ended: nothing new is asked for; the request in flight still lands in the cache. */
	end(): void {
		this.target = null;
	}

	/** The answer for the step of [positionMs], if the phone gave it. */
	entryFor(positionMs: number, durationMs: number): PreviewEntry | undefined {
		if (!this.available || !(durationMs > 0)) return undefined;
		const step = previewStepOf(positionMs, durationMs);
		const entry = this.entries.get(step);
		if (entry !== undefined) {
			// Recently used
			this.entries.delete(step);
			this.entries.set(step, entry);
		}
		return entry;
	}

	/** A `previewFrame` reply. False when it is about another stream (stale) and was dropped. */
	onFrame(message: PreviewFrameMessage): boolean {
		if (this.source === null || message.sourceId !== this.source.id) return false;
		if (this.inFlight !== null && this.inFlight.requestId === message.requestId) {
			clearTimeout(this.inFlight.timer);
			this.inFlight = null;
		}
		if (message.status === 'off') {
			this.off = true;
			this.target = null;
			if (this.inFlight !== null) clearTimeout(this.inFlight.timer);
			this.inFlight = null;
		} else {
			this.put(
				message.step,
				message.status === 'ok' && message.jpeg !== null
					? { kind: 'frame', src: `data:image/jpeg;base64,${message.jpeg}` }
					: { kind: 'none' },
			);
			this.pump();
		}
		this.onChange();
		return true;
	}

	private put(step: number, entry: PreviewEntry): void {
		this.entries.delete(step);
		this.entries.set(step, entry);
		while (this.entries.size > this.maxEntries) {
			const oldest = this.entries.keys().next().value;
			if (oldest === undefined) break;
			this.entries.delete(oldest);
		}
	}

	private pump(): void {
		const source = this.source;
		const target = this.target;
		if (this.inFlight !== null || target === null || source === null || !this.available) return;
		if (this.entries.has(target.step)) return;
		const requestId = this.nextRequestId++;
		const timer = setTimeout(() => this.onTimeout(requestId), this.timeoutMs);
		this.inFlight = { requestId, step: target.step, timer };
		this.send({
			type: PREVIEW_REQUEST_TYPE,
			requestId,
			sourceId: source.id,
			url: source.url,
			headers: source.headers,
			step: target.step,
			duration: target.durationMs,
		});
	}

	/** No reply in time (lost message): the step counts as frameless, like a phone-side timeout. */
	private onTimeout(requestId: number): void {
		const inFlight = this.inFlight;
		if (inFlight === null || inFlight.requestId !== requestId) return;
		this.inFlight = null;
		this.put(inFlight.step, { kind: 'none' });
		this.onChange();
		this.pump();
	}
}
