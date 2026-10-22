import { beforeEach, describe, expect, it } from 'vitest';
import type { PreviewRequestMessage, PreviewSourceMessage, StreamSource } from '../cast/protocol';
import * as store from '../player/store';
import {
	announcePreviewSource,
	handlePreviewFrame,
	initSeekPreview,
	previewEnd,
	previewScrub,
	previewSourceFor,
	previewView,
	resetPreview,
} from './seekPreview';

const HOUR = 3_600_000;

function source(url: string, server = 'S', quality = '1080p'): StreamSource {
	return { url, fullName: '', quality, server, headers: { Referer: 'https://r.example/' }, subtitleTracks: [], audioTracks: [] };
}

describe('seekPreview wiring', () => {
	let sent: PreviewRequestMessage[];
	let announced: PreviewSourceMessage[];

	beforeEach(() => {
		sent = [];
		announced = [];
		initSeekPreview((m) => (m.type === 'previewRequest' ? sent.push(m) : announced.push(m)));
		store.resetToIdle();
		resetPreview();
		store.sources.value = [source('https://a.example/ep.m3u8'), source('https://b.example/ep.mp4', 'B', '720p')];
		store.selectedSourceIndex.value = 0;
		store.currentEpisodeId.value = 7;
		store.durationMs.value = HOUR;
		store.seekPreview.value = true;
	});

	it('identifies the stream by episode, url, server and quality', () => {
		expect(previewSourceFor(7, source('https://a.example/ep.m3u8')).id).toBe('7|https://a.example/ep.m3u8|S|1080p');
		expect(previewSourceFor(8, source('https://a.example/ep.m3u8')).id).not.toBe(
			previewSourceFor(7, source('https://a.example/ep.m3u8')).id,
		);
	});

	it('shows the time while the frame loads, then the frame', () => {
		previewScrub(95_000);
		expect(previewView.value).toEqual({ positionMs: 95_000, frame: null });
		expect(sent).toHaveLength(1);
		expect(sent[0]).toMatchObject({ url: 'https://a.example/ep.m3u8', headers: { Referer: 'https://r.example/' }, step: 3 });

		handlePreviewFrame({ type: 'previewFrame', requestId: sent[0].requestId, sourceId: sent[0].sourceId, step: 3, status: 'ok', jpeg: 'AAAA' });
		expect(previewView.value).toEqual({ positionMs: 95_000, frame: 'data:image/jpeg;base64,AAAA' });

		previewEnd();
		expect(previewView.value).toBeNull();
	});

	it('shows nothing without the phone announcing previews (old phone or setting off)', () => {
		store.seekPreview.value = false;
		previewScrub(95_000);
		expect(previewView.value).toBeNull();
		expect(sent).toHaveLength(0);
	});

	it('forgets the frames of the previous source and drops its replies', () => {
		previewScrub(0);
		const first = sent[0];
		handlePreviewFrame({ type: 'previewFrame', requestId: first.requestId, sourceId: first.sourceId, step: 0, status: 'ok', jpeg: 'AAAA' });
		previewEnd();

		// Receiver-local source switch (tracks.switchSource resets, then the selection moves)
		resetPreview();
		store.selectedSourceIndex.value = 1;
		previewScrub(0);
		expect(previewView.value).toEqual({ positionMs: 0, frame: null });
		expect(sent[1]).toMatchObject({ url: 'https://b.example/ep.mp4', sourceId: '7|https://b.example/ep.mp4|B|720p' });

		// A late reply about source A is stale
		handlePreviewFrame({ type: 'previewFrame', requestId: 99, sourceId: first.sourceId, step: 0, status: 'ok', jpeg: 'OLD' });
		expect(previewView.value).toEqual({ positionMs: 0, frame: null });
	});

	it('hides the card once the phone says the stream has no preview', () => {
		previewScrub(0);
		handlePreviewFrame({ type: 'previewFrame', requestId: sent[0].requestId, sourceId: sent[0].sourceId, step: 0, status: 'off', jpeg: null });
		expect(previewView.value).toBeNull();
	});

	it('announces the stream to the phone once, with its duration', () => {
		expect(announced).toHaveLength(1);
		expect(announced[0]).toEqual({
			type: 'previewSource',
			sourceId: '7|https://a.example/ep.m3u8|S|1080p',
			url: 'https://a.example/ep.m3u8',
			headers: { Referer: 'https://r.example/' },
			duration: HOUR,
			steps: [],
		});
		// The 2 Hz ticker nudging the duration doesn't announce it again
		store.durationMs.value = HOUR + 250;
		expect(announced).toHaveLength(1);
	});

	it('announces a source switch, and nothing without the phone making previews', () => {
		resetPreview();
		store.selectedSourceIndex.value = 1;
		expect(announced.map((m) => m.sourceId)).toEqual([
			'7|https://a.example/ep.m3u8|S|1080p',
			'7|https://b.example/ep.mp4|B|720p',
		]);
		store.seekPreview.value = false;
		resetPreview();
		store.selectedSourceIndex.value = 0;
		expect(announced).toHaveLength(2);
	});

	it('caches the frames the phone pushes before any scrub, so the scrub shows them at once', () => {
		const sourceId = announced[0].sourceId;
		for (const step of [0, 1, 2, 3]) {
			handlePreviewFrame({ type: 'previewFrame', requestId: null, sourceId, step, status: 'ok', jpeg: `F${step}` });
		}
		previewScrub(95_000);
		expect(previewView.value).toEqual({ positionMs: 95_000, frame: 'data:image/jpeg;base64,F3' });
		expect(sent).toHaveLength(0);
	});

	it('drops pushed frames of another stream', () => {
		handlePreviewFrame({ type: 'previewFrame', requestId: null, sourceId: '6|https://old.example/ep.m3u8|S|1080p', step: 3, status: 'ok', jpeg: 'OLD' });
		previewScrub(95_000);
		expect(previewView.value).toEqual({ positionMs: 95_000, frame: null });
		expect(sent).toHaveLength(1);
	});

	it('tells a (re)connecting phone which steps it already holds', () => {
		const sourceId = announced[0].sourceId;
		handlePreviewFrame({ type: 'previewFrame', requestId: null, sourceId, step: 5, status: 'ok', jpeg: 'F5' });
		handlePreviewFrame({ type: 'previewFrame', requestId: null, sourceId, step: 2, status: 'none', jpeg: null });
		announcePreviewSource(true);
		expect(announced).toHaveLength(2);
		expect(announced[1].steps).toEqual([2, 5]);
	});
});
