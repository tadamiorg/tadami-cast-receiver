/**
 * Minimal WebVTT parser producing the cue model the custom renderer needs: start/end,
 * plain text (markup stripped) and the `line` cue setting (line-number form) used for
 * row stacking — mirroring the semantics Terebi's renderer reads off media3's parser.
 */

export interface SubtitleCue {
	startMs: number;
	endMs: number;
	/** Plain text, markup stripped, lines joined with '\n'. */
	text: string;
	/**
	 * VTT `line` setting when it is a LINE-NUMBER (integer, possibly negative;
	 * -1 = last line). null when absent or percentage-based.
	 */
	line: number | null;
}

const TIMESTAMP = /(?:(\d{1,4}):)?(\d{1,2}):(\d{2})[.,](\d{3})/;
const CUE_TIMING = new RegExp(`^\\s*${TIMESTAMP.source}\\s*-->\\s*${TIMESTAMP.source}(.*)$`);

/** Parses one VTT timestamp ("MM:SS.mmm" or "HH:MM:SS.mmm") to milliseconds, or null. */
export function parseVttTimestamp(text: string): number | null {
	const match = new RegExp(`^\\s*${TIMESTAMP.source}\\s*$`).exec(text);
	if (!match) return null;
	const hours = match[1] !== undefined ? parseInt(match[1], 10) : 0;
	const minutes = parseInt(match[2], 10);
	const seconds = parseInt(match[3], 10);
	const millis = parseInt(match[4], 10);
	return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}

/** Strips VTT/HTML markup (`<i>`, `<c.class>`, `<00:00:01.000>`, …) and decodes basic entities. */
export function stripCueMarkup(text: string): string {
	return text
		.replace(/<[^>]*>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
}

function parseLineSetting(settings: string): number | null {
	for (const part of settings.trim().split(/\s+/)) {
		const [key, rawValue] = part.split(':', 2);
		if (key !== 'line' || rawValue === undefined) continue;
		// Only the line-NUMBER form matters for row stacking; percentages are ignored.
		const value = rawValue.split(',', 1)[0];
		if (value.endsWith('%')) return null;
		const parsed = parseInt(value, 10);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

/** Tolerant WEBVTT parse. Unparseable blocks are skipped, never thrown on. */
export function parseVtt(content: string): SubtitleCue[] {
	const cues: SubtitleCue[] = [];
	// Normalize newlines, drop BOM.
	const lines = content.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');

	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		const timing = CUE_TIMING.exec(line);
		if (!timing) {
			i++;
			continue;
		}
		const start =
			((timing[1] !== undefined ? parseInt(timing[1], 10) : 0) * 3600 +
				parseInt(timing[2], 10) * 60 +
				parseInt(timing[3], 10)) *
				1000 +
			parseInt(timing[4], 10);
		const end =
			((timing[5] !== undefined ? parseInt(timing[5], 10) : 0) * 3600 +
				parseInt(timing[6], 10) * 60 +
				parseInt(timing[7], 10)) *
				1000 +
			parseInt(timing[8], 10);
		const lineSetting = parseLineSetting(timing[9] ?? '');

		// Collect the payload until a blank line.
		const textLines: string[] = [];
		i++;
		while (i < lines.length && lines[i].trim() !== '') {
			textLines.push(lines[i]);
			i++;
		}
		const text = stripCueMarkup(textLines.join('\n')).trim();
		if (text !== '' && end > start) {
			cues.push({ startMs: start, endMs: end, text, line: lineSetting });
		}
	}
	cues.sort((a, b) => a.startMs - b.startMs);
	return cues;
}
