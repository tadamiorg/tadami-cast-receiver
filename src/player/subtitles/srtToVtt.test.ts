import { describe, expect, it } from 'vitest';
import { looksLikeSrt, srtToVtt } from './srtToVtt';
import { parseVtt } from './vttParser';

const SRT = [
	'1',
	'00:00:20,000 --> 00:00:24,400',
	'First subtitle',
	'',
	'2',
	'00:00:24,600 --> 00:00:27,800',
	'Second, on',
	'two lines',
	'',
].join('\r\n');

describe('srtToVtt', () => {
	it('detects SubRip content', () => {
		expect(looksLikeSrt(SRT)).toBe(true);
		expect(looksLikeSrt('WEBVTT\n\n00:00.000 --> 00:01.000\nx')).toBe(false);
	});

	it('converts commas, drops counters and prepends the header', () => {
		const vtt = srtToVtt(SRT);
		expect(vtt.startsWith('WEBVTT')).toBe(true);
		expect(vtt).toContain('00:00:20.000 --> 00:00:24.400');
		expect(vtt).not.toMatch(/^1$/m);
	});

	it('round-trips through the VTT parser', () => {
		const cues = parseVtt(srtToVtt(SRT));
		expect(cues).toHaveLength(2);
		expect(cues[0]).toMatchObject({ startMs: 20000, endMs: 24400, text: 'First subtitle' });
		expect(cues[1].text).toBe('Second, on\ntwo lines');
	});

	it('keeps numeric-only subtitle text (only counters before timings are dropped)', () => {
		const srt = '1\n00:00:01,000 --> 00:00:02,000\n42\n';
		const cues = parseVtt(srtToVtt(srt));
		expect(cues[0].text).toBe('42');
	});
});
