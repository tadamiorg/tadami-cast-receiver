/**
 * SubRip → WebVTT conversion: prepend the WEBVTT header, drop numeric cue counters and
 * turn `,` millisecond separators into `.` on timing lines. Everything else passes through
 * (the VTT parser strips markup afterwards).
 */

const SRT_TIMING = /^(\s*)((?:\d{1,4}:)?\d{1,2}:\d{2})[,.](\d{3})(\s*-->\s*)((?:\d{1,4}:)?\d{1,2}:\d{2})[,.](\d{3})(.*)$/;

/** True when the text smells like SubRip (comma-millisecond timing lines). */
export function looksLikeSrt(content: string): boolean {
	return /\d{1,2}:\d{2}:\d{2},\d{3}\s*-->/.test(content);
}

export function srtToVtt(content: string): string {
	const lines = content.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
	const out: string[] = ['WEBVTT', ''];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const timing = SRT_TIMING.exec(line);
		if (timing) {
			// Drop the numeric counter that (optionally) directly precedes a timing line.
			if (out.length > 0 && /^\s*\d+\s*$/.test(out[out.length - 1] ?? '')) {
				out.pop();
			}
			out.push(`${timing[2]}.${timing[3]}${timing[4].replace(/\s+/g, ' ')}${timing[5]}.${timing[6]}${timing[7]}`);
		} else {
			out.push(line);
		}
	}
	return out.join('\n');
}
