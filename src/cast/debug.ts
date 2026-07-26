/**
 * Lightweight receiver-side logging for diagnosing playback.
 *
 * EVERYTHING here is gated on the receiver URL carrying `?debug` (e.g. `…-dev.web.app/?debug=1`,
 * the dev-registered receiver): without it `debugLog` is a no-op — the production receiver logs
 * nothing, because the traces include media URLs with their `headers=` blobs (Referer/Cookie) and
 * the phone's LAN address. With it, lines go to the JS console (chrome://inspect) AND a small
 * on-screen overlay, so a request trace is readable directly on the TV without a PC attached.
 */

const PREFIX = "[tadami]";
const MAX_LINES = 25;

let overlay: HTMLElement | null = null;
const lines: string[] = [];

export function isDebug(): boolean {
	try {
		return /[?&]debug\b/.test(location.search);
	} catch {
		return false;
	}
}

/** Creates the on-screen log overlay (no-op unless `?debug`). Call once at boot. */
export function initDebugOverlay(): void {
	if (!isDebug() || overlay !== null) return;
	const el = document.createElement("div");
	el.setAttribute("data-debug-overlay", "");
	el.style.cssText = [
		"position:fixed",
		"top:0",
		"left:0",
		"max-width:60vw",
		"max-height:45vh",
		"overflow:hidden",
		"z-index:2147483647",
		"background:rgba(0,0,0,0.6)",
		"color:#9fef9f",
		"font:11px/1.35 monospace",
		"padding:6px 8px",
		"white-space:pre-wrap",
		"word-break:break-all",
		"pointer-events:none",
	].join(";");
	document.body.appendChild(el);
	overlay = el;
	render();
}

export function debugLog(message: string): void {
	if (!isDebug()) return;
	// eslint-disable-next-line no-console
	console.info(`${PREFIX} ${message}`);
	lines.push(message);
	if (lines.length > MAX_LINES) lines.shift();
	render();
}

function render(): void {
	if (overlay !== null) overlay.textContent = lines.join("\n");
}
