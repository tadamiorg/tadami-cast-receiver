/**
 * Subtitle engine: fetches the selected track (through the phone proxy, which adds CORS),
 * sniffs the format, parses it to cues and computes the active cue set on a timer.
 *
 * Rendering is done by src/ui/SubtitleView.tsx off the `activeCues` signal. The engine is a
 * *strategy*: if some frozen Chromecast runtime ever blocks the `fetch()` (mixed-content
 * edge), a `<track>`-element strategy riding the media pipeline's mixed-content exemption
 * can implement the same `SubtitleSource` interface and feed the same signal.
 */

import { signal } from '@preact/signals';
import { debugLog } from '../../cast/debug';
import { wrapCorsUrl } from '../../proxy/proxyUrl';
import { looksLikeSrt, srtToVtt } from './srtToVtt';
import { parseVtt, type SubtitleCue } from './vttParser';

export interface ActiveCue {
	text: string;
	/** VTT line-number setting (null = auto). */
	line: number | null;
}

/** How often the active-cue set is recomputed while media plays. */
const TICK_MS = 250;

export const activeCues = signal<ActiveCue[]>([]);

let cues: SubtitleCue[] = [];
let fetchToken = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let rafId: number | null = null;
let positionProvider: (() => number) | null = null;

/** Wire the engine to the player clock (ms provider). Starts the tick loop. */
export function initSubtitleEngine(getPositionMs: () => number): void {
	positionProvider = getPositionMs;
	if (timer !== null) clearInterval(timer);
	// 250 ms interval + a rAF alignment for the actual signal write keeps updates cheap and
	// visually in sync with the compositor without a permanent 60 Hz loop.
	timer = setInterval(() => {
		if (rafId !== null) return;
		if (typeof requestAnimationFrame === 'function') {
			rafId = requestAnimationFrame(() => {
				rafId = null;
				tick();
			});
		} else {
			tick();
		}
	}, TICK_MS);
}

/** Detects the subtitle format and returns parsed cues (empty on failure — never throws). */
export function parseSubtitleText(text: string, mimeType: string, url: string): SubtitleCue[] {
	const mime = mimeType.toLowerCase();
	const path = url.split(/[?#]/, 1)[0].toLowerCase();
	try {
		if (mime.includes('vtt') || path.endsWith('.vtt')) return parseVtt(text);
		if (mime.includes('srt') || mime.includes('subrip') || path.endsWith('.srt')) {
			return parseVtt(srtToVtt(text));
		}
		// Unknown mime (`text/x-unknown` is common): sniff the body.
		if (/^\s*(?:﻿)?WEBVTT/.test(text)) return parseVtt(text);
		if (looksLikeSrt(text)) return parseVtt(srtToVtt(text));
		// .ass and friends: not supported yet (follow-up); fail silently.
		return [];
	} catch {
		return [];
	}
}

/**
 * Loads a subtitle track (or clears with null). Track URLs are RAW; they are wrapped through
 * the phone proxy here, at fetch time — ALWAYS (wrapCorsUrl, not the header-gated
 * wrapRequestUrl): this is a plain fetch(), and subtitle origins rarely send CORS headers.
 */
export async function setSubtitleTrack(
	track: { url: string; mimeType: string } | null,
): Promise<void> {
	const token = ++fetchToken;
	cues = [];
	activeCues.value = [];
	if (track === null || track.url === '') return;
	const fetchUrl = wrapCorsUrl(track.url);
	try {
		const response = await fetch(fetchUrl);
		debugLog(`subtitle ${response.status} ${track.mimeType} ${track.url}`);
		if (!response.ok) return;
		const text = await response.text();
		if (token !== fetchToken) return; // superseded by a newer selection
		cues = parseSubtitleText(text, track.mimeType, track.url);
		if (cues.length === 0) {
			// Downloaded fine but nothing to show: an unsupported format (ASS/SSA, TTML — both of
			// which ExoPlayer renders on the phone) or an empty file. Looks identical to "off" on
			// screen while the track stays selected, so say so out loud.
			debugLog(`subtitle NO CUES (unsupported format?) type=${track.mimeType} ${track.url}`);
		} else {
			debugLog(`subtitle parsed ${cues.length} cues ${track.url}`);
		}
		tick();
	} catch (e) {
		// Unreachable proxy / CORS failure: subtitles silently stay off.
		debugLog(`subtitle FAILED ${track.url} — ${String(e)}`);
	}
}

function tick(): void {
	if (positionProvider === null) return;
	if (cues.length === 0) {
		if (activeCues.value.length > 0) activeCues.value = [];
		return;
	}
	const position = positionProvider();
	const next: ActiveCue[] = [];
	for (const cue of cues) {
		if (cue.startMs > position) break; // cues are sorted by start
		if (position < cue.endMs) next.push({ text: cue.text, line: cue.line });
	}
	if (!sameCues(activeCues.value, next)) {
		activeCues.value = next;
	}
}

function sameCues(a: ActiveCue[], b: ActiveCue[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i].text !== b[i].text || a[i].line !== b[i].line) return false;
	}
	return true;
}
