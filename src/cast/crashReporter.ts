/**
 * Crash reporting to the phone over `urn:x-cast:com.sf.tadami.crash` (mirrors Terebi's
 * CrashReporter): uncaught errors / unhandled rejections become a CrashLog. Because sending
 * while the runtime is dying is unreliable, the log is also persisted to localStorage and
 * flushed on the next sender connect.
 */

import { debugLog } from './debug';
import { CRASH_NAMESPACE, CRASH_PACKAGE_NAME, type CrashLog } from './protocol';

const STORAGE_KEY = 'tadami.pendingCrash';
const MAX_LEN = 24_000;

declare const __RECEIVER_VERSION__: string;

function buildLog(stacktrace: string): CrashLog {
	return {
		stacktrace: stacktrace.slice(0, MAX_LEN),
		packageName: CRASH_PACKAGE_NAME,
		versionName: __RECEIVER_VERSION__,
		timestamp: Date.now(),
	};
}

function trySend(log: CrashLog): boolean {
	try {
		const context = cast.framework.CastReceiverContext.getInstance();
		context.sendCustomMessage(CRASH_NAMESPACE, undefined, log);
		return true;
	} catch {
		return false;
	}
}

function persist(log: CrashLog): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
	} catch {
		// Storage full/unavailable — best effort only.
	}
}

function clearPersisted(): void {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// ignore
	}
}

export function reportCrash(stacktrace: string): void {
	const log = buildLog(stacktrace);
	persist(log);
	if (trySend(log)) clearPersisted();
}

/** Sends any crash persisted before the last restart. Call once a sender is connected. */
export function flushPendingCrash(): void {
	let raw: string | null = null;
	try {
		raw = localStorage.getItem(STORAGE_KEY);
	} catch {
		return;
	}
	if (raw === null) return;
	try {
		const log = JSON.parse(raw) as CrashLog;
		if (trySend(log)) clearPersisted();
	} catch {
		clearPersisted(); // corrupt entry — drop it
	}
}

/** Installs window.onerror / unhandledrejection hooks. Call as early as possible. */
export function installCrashReporter(): void {
	window.addEventListener('error', (event) => {
		// Resource-load failure, not a script crash: an <img>/<script>/<link>/media element that
		// 404s or is hotlink-blocked fires an error event whose target is the ELEMENT (and whose
		// filename is that resource's URL) — anime hosts hotlink-protect their images, and subtitle
		// or segment fetches can fail too. Playback is unaffected, so this must never surface as a
		// crash report on the phone.
		if (event.target !== null && event.target !== window) {
			const element = event.target as { src?: string; href?: string; tagName?: string };
			debugLog(
				`crash: resource load error ignored <${element.tagName ?? '?'}> ${element.src ?? element.href ?? '?'}`,
			);
			return;
		}
		// Masked cross-origin error: an uncaught throw inside a script loaded from another origin
		// without CORS attributes (the CAF SDK, the Shaka build CAF injects) is censored by the
		// browser to exactly "Script error." at :0:0 with no error object. These fire during
		// perfectly working playback (benign CAF/Shaka internals) and carry ZERO diagnostic
		// value — reporting them as crashes only spams the phone with a scary dialog.
		const masked =
			event.error === null || event.error === undefined
				? /^Script error\.?$/.test(event.message ?? '') ||
					((event.filename ?? '') === '' && (event.lineno ?? 0) === 0 && (event.colno ?? 0) === 0)
				: false;
		if (masked) {
			debugLog('crash: masked cross-origin error ignored');
			return;
		}
		const stack =
			event.error instanceof Error && typeof event.error.stack === 'string'
				? event.error.stack
				: `${event.message} (${event.filename ?? '?'}:${event.lineno ?? 0}:${event.colno ?? 0})`;
		reportCrash(stack);
	});
	window.addEventListener('unhandledrejection', (event) => {
		const reason: unknown = event.reason;
		const stack =
			reason instanceof Error && typeof reason.stack === 'string'
				? reason.stack
				: `Unhandled rejection: ${String(reason)}`;
		reportCrash(stack);
	});
}
