import { describe, expect, it } from 'vitest';
import { parseVtt, parseVttTimestamp, stripCueMarkup } from './vttParser';

describe('parseVttTimestamp', () => {
	it('parses MM:SS.mmm and HH:MM:SS.mmm', () => {
		expect(parseVttTimestamp('00:05.250')).toBe(5250);
		expect(parseVttTimestamp('01:02:03.004')).toBe(3723004);
	});

	it('rejects garbage', () => {
		expect(parseVttTimestamp('nope')).toBeNull();
	});
});

describe('parseVtt', () => {
	it('parses a basic file with header, ids and multi-line cues', () => {
		const cues = parseVtt(
			[
				'WEBVTT',
				'',
				'1',
				'00:00:01.000 --> 00:00:04.000',
				'First line',
				'second line',
				'',
				'00:05.000 --> 00:08.500',
				'Short-form timestamps',
				'',
			].join('\n'),
		);
		expect(cues).toHaveLength(2);
		expect(cues[0]).toEqual({ startMs: 1000, endMs: 4000, text: 'First line\nsecond line', line: null });
		expect(cues[1].startMs).toBe(5000);
		expect(cues[1].endMs).toBe(8500);
	});

	it('reads negative line-number settings (row stacking)', () => {
		const cues = parseVtt('WEBVTT\n\n00:01.000 --> 00:02.000 line:-3\nUp one row\n');
		expect(cues[0].line).toBe(-3);
	});

	it('ignores percentage line settings', () => {
		const cues = parseVtt('WEBVTT\n\n00:01.000 --> 00:02.000 line:90%\nPercent\n');
		expect(cues[0].line).toBeNull();
	});

	it('strips markup and decodes entities', () => {
		const cues = parseVtt(
			'WEBVTT\n\n00:01.000 --> 00:02.000\n<i>Italic</i> &amp; <c.yellow>classy</c> &lt;tag&gt;\n',
		);
		expect(cues[0].text).toBe('Italic & classy <tag>');
	});

	it('skips malformed blocks and empty cues without throwing', () => {
		const cues = parseVtt(
			'WEBVTT\n\nNOT A CUE\n\n00:02.000 --> 00:01.000\nBackwards\n\n00:03.000 --> 00:04.000\nGood\n',
		);
		expect(cues).toHaveLength(1);
		expect(cues[0].text).toBe('Good');
	});

	it('sorts cues by start time', () => {
		const cues = parseVtt(
			'WEBVTT\n\n00:10.000 --> 00:11.000\nlate\n\n00:01.000 --> 00:02.000\nearly\n',
		);
		expect(cues.map((c) => c.text)).toEqual(['early', 'late']);
	});
});

describe('stripCueMarkup', () => {
	it('removes timestamps tags too', () => {
		expect(stripCueMarkup('a<00:00:01.000>b')).toBe('ab');
	});
});
