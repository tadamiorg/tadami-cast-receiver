import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreviewFrameMessage, PreviewRequestMessage } from '../cast/protocol';
import { PreviewController, type PreviewSource } from './previewController';
import { previewStepOf, previewStepSizeMs } from './previewSteps';

const HOUR = 3_600_000;
const SOURCE_A: PreviewSource = { id: '7|https://a.example/ep.m3u8|A|1080p', url: 'https://a.example/ep.m3u8', headers: { Referer: 'https://a.example/' } };
const SOURCE_B: PreviewSource = { id: '7|https://b.example/ep.mp4|B|720p', url: 'https://b.example/ep.mp4', headers: null };

function frame(request: PreviewRequestMessage, overrides: Partial<PreviewFrameMessage> = {}): PreviewFrameMessage {
	return {
		type: 'previewFrame',
		requestId: request.requestId,
		sourceId: request.sourceId,
		step: request.step,
		status: 'ok',
		jpeg: `JPEG${request.step}`,
		...overrides,
	};
}

describe('preview steps (port of SeekPreviewLogic.kt)', () => {
	it('is 1% of the duration, 5 s at least and 30 s at most', () => {
		expect(previewStepSizeMs(24 * 60_000)).toBe(14_400);
		expect(previewStepSizeMs(60_000)).toBe(5_000);
		expect(previewStepSizeMs(2 * HOUR)).toBe(30_000);
		expect(previewStepSizeMs(0)).toBe(5_000);
	});

	it('puts positions out of the video in its first or last step', () => {
		const duration = 24 * 60_000;
		expect(previewStepOf(0, duration)).toBe(0);
		expect(previewStepOf(14_399, duration)).toBe(0);
		expect(previewStepOf(14_400, duration)).toBe(1);
		expect(previewStepOf(-5_000, duration)).toBe(0);
		expect(previewStepOf(duration + 60_000, duration)).toBe(previewStepOf(duration - 1, duration));
		expect(previewStepOf(duration - 1, duration)).toBe(99);
	});
});

describe('PreviewController', () => {
	let sent: PreviewRequestMessage[];
	let changes: number;
	let controller: PreviewController;

	beforeEach(() => {
		vi.useFakeTimers();
		sent = [];
		changes = 0;
		controller = new PreviewController({ send: (r) => sent.push(r), onChange: () => changes++ });
		controller.setSource(SOURCE_A, true);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('asks for the step under the scrub position with the stream it plays', () => {
		controller.aim(100_000, HOUR);
		expect(sent).toEqual([
			{
				type: 'previewRequest',
				requestId: 1,
				sourceId: SOURCE_A.id,
				url: SOURCE_A.url,
				headers: SOURCE_A.headers,
				// 1% of an hour is 36 s, past the 30 s bound
				step: 3,
				duration: HOUR,
			},
		]);
	});

	it('keeps one request in flight and asks for the latest step once it is answered', () => {
		controller.aim(0, HOUR);
		controller.aim(40_000, HOUR);
		controller.aim(80_000, HOUR);
		expect(sent.map((r) => r.step)).toEqual([0]);
		expect(controller.pendingRequests).toBe(1);

		expect(controller.onFrame(frame(sent[0]))).toBe(true);
		// The target moved on meanwhile: only the step under the position now, not the ones skipped
		expect(sent.map((r) => r.step)).toEqual([0, 2]);
	});

	it('shows a cached step at once and never asks for it again', () => {
		controller.aim(0, HOUR);
		controller.onFrame(frame(sent[0]));
		expect(controller.entryFor(10_000, HOUR)).toEqual({ kind: 'frame', src: 'data:image/jpeg;base64,JPEG0' });

		controller.end();
		controller.aim(20_000, HOUR);
		expect(sent).toHaveLength(1);
		expect(changes).toBe(1);
	});

	it('remembers a frameless step and does not ask for it again', () => {
		controller.aim(0, HOUR);
		controller.onFrame(frame(sent[0], { status: 'none', jpeg: null }));
		expect(controller.entryFor(0, HOUR)).toEqual({ kind: 'none' });
		controller.aim(1_000, HOUR);
		expect(sent).toHaveLength(1);
	});

	it('drops replies about another stream', () => {
		controller.aim(0, HOUR);
		const stale = frame(sent[0], { sourceId: SOURCE_B.id });
		expect(controller.onFrame(stale)).toBe(false);
		expect(controller.entryFor(0, HOUR)).toBeUndefined();
		// Still waiting for the real answer
		expect(controller.pendingRequests).toBe(1);
		expect(changes).toBe(0);
	});

	it('drops the frames and the request in flight on another stream, then ignores the old replies', () => {
		controller.aim(0, HOUR);
		const oldRequest = sent[0];
		controller.onFrame(frame(oldRequest));
		controller.aim(30_000, HOUR);
		const inFlight = sent[1];

		controller.setSource(SOURCE_B, true);
		expect(controller.cachedSteps).toBe(0);
		expect(controller.pendingRequests).toBe(0);
		expect(controller.onFrame(frame(inFlight))).toBe(false);

		controller.aim(0, HOUR);
		expect(sent[2]).toMatchObject({ sourceId: SOURCE_B.id, url: SOURCE_B.url, headers: null, step: 0 });
	});

	it('keeps everything for the same stream', () => {
		controller.aim(0, HOUR);
		controller.onFrame(frame(sent[0]));
		controller.setSource({ ...SOURCE_A }, true);
		expect(controller.cachedSteps).toBe(1);
	});

	it('clears everything on reset (new LOAD)', () => {
		controller.aim(0, HOUR);
		controller.onFrame(frame(sent[0]));
		controller.aim(30_000, HOUR);
		controller.reset();
		expect(controller.cachedSteps).toBe(0);
		expect(controller.pendingRequests).toBe(0);
		expect(controller.available).toBe(false);
		// The timed-out request of the old load must not fire anything
		vi.advanceTimersByTime(60_000);
		expect(sent).toHaveLength(2);
	});

	it('stays silent when the phone announced no preview', () => {
		controller.setSource(SOURCE_A, false);
		controller.aim(0, HOUR);
		expect(sent).toHaveLength(0);
		expect(controller.available).toBe(false);
		expect(controller.entryFor(0, HOUR)).toBeUndefined();
	});

	it('needs a duration', () => {
		controller.aim(10_000, 0);
		expect(sent).toHaveLength(0);
	});

	it('stops asking once the phone says the stream has no preview', () => {
		controller.aim(0, HOUR);
		controller.onFrame(frame(sent[0], { status: 'off', jpeg: null }));
		expect(controller.available).toBe(false);
		controller.aim(60_000, HOUR);
		expect(sent).toHaveLength(1);
		// Until another stream
		controller.setSource(SOURCE_B, true);
		controller.aim(60_000, HOUR);
		expect(sent).toHaveLength(2);
	});

	it('gives a step up when the phone never answers, then asks for the next one', () => {
		controller.aim(0, HOUR);
		controller.aim(60_000, HOUR);
		vi.advanceTimersByTime(14_999);
		expect(sent).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(controller.entryFor(0, HOUR)).toEqual({ kind: 'none' });
		expect(sent.map((r) => r.step)).toEqual([0, 2]);
	});

	it('still caches a late reply of a timed-out request', () => {
		controller.aim(0, HOUR);
		const late = sent[0];
		vi.advanceTimersByTime(15_000);
		controller.onFrame(frame(late));
		expect(controller.entryFor(0, HOUR)).toEqual({ kind: 'frame', src: 'data:image/jpeg;base64,JPEG0' });
	});

	it('lets the request in flight land after scrubbing ended, without asking for more', () => {
		controller.aim(0, HOUR);
		controller.end();
		controller.onFrame(frame(sent[0]));
		expect(controller.cachedSteps).toBe(1);
		expect(sent).toHaveLength(1);
	});

	it('keeps the most recently used steps within its bound', () => {
		const small = new PreviewController({ send: (r) => sent.push(r), maxEntries: 2 });
		small.setSource(SOURCE_A, true);
		for (const position of [0, 30_000, 60_000]) {
			small.aim(position, HOUR);
			small.onFrame(frame(sent[sent.length - 1]));
		}
		expect(small.cachedSteps).toBe(2);
		expect(small.entryFor(0, HOUR)).toBeUndefined();
		expect(small.entryFor(30_000, HOUR)?.kind).toBe('frame');
	});
});
