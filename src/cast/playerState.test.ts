import { describe, expect, it } from 'vitest';
import { playbackFlagsFor } from './playerState';

describe('playbackFlagsFor', () => {
	it('playing clears the spinner and buffering', () => {
		expect(playbackFlagsFor('playing')).toEqual({
			isPlaying: true,
			buffering: false,
			clearLoading: true,
		});
	});

	it('paused keeps the media but stops playback', () => {
		expect(playbackFlagsFor('paused')).toEqual({
			isPlaying: false,
			buffering: false,
			clearLoading: true,
		});
	});

	it('buffering leaves isPlaying alone (mid-playback rebuffer)', () => {
		expect(playbackFlagsFor('buffering')).toEqual({
			isPlaying: null,
			buffering: true,
			clearLoading: false,
		});
	});

	it('loading keeps the scrimmed spinner up', () => {
		expect(playbackFlagsFor('loading')).toEqual({
			isPlaying: null,
			buffering: false,
			clearLoading: false,
		});
	});

	it('idle stops everything', () => {
		expect(playbackFlagsFor('idle')).toEqual({
			isPlaying: false,
			buffering: false,
			clearLoading: true,
		});
	});

	it('launching and unknown states touch nothing', () => {
		const inert = { isPlaying: null, buffering: null, clearLoading: false };
		expect(playbackFlagsFor('launching')).toEqual(inert);
		expect(playbackFlagsFor('somethingNewFromAFutureSdk')).toEqual(inert);
		expect(playbackFlagsFor('')).toEqual(inert);
	});
});
