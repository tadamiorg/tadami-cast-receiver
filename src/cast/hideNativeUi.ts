/**
 * Suppresses the SDK's built-in TV overlay (title, progress bar, transport chrome).
 *
 * The overlay is drawn by CAF's own **web components** — `cast-media-player`, `tv-overlay`, whatever a
 * given SDK build injects — and it is created lazily, after playback starts or metadata loads, so it
 * cannot be styled away up front. Earlier passes targeted `cast-media-player` by name and turned out to
 * be complete no-ops (the element isn't even in the page), which is why the overlay survived every
 * attempt. So this does not name anything:
 *
 * - The SDK's UI is custom elements (tag names contain a dash). Ours is plain `div`s inside `#app`, and
 *   our media surface is a plain `<video class="castMediaElement">`. Anything with a dash outside `#app`
 *   is therefore the SDK's.
 * - INVARIANT: never hide an element that contains the live media element. Hiding a container that owned
 *   the picture blanked the TV twice; if a component holds the video, it stays visible and only its
 *   shadow overlay is styled away (global CSS cannot reach into a shadow root).
 *
 * The scan result (what exists, what plays, what was hidden — including the "found nothing" case)
 * is debugLog'd once per session for `?debug` receivers.
 */

import { debugLog } from './debug';

const STYLE_ID = 'tadami-disable-default-overlay';

/** Containers CAF is known to draw its TV UI in; scoped to a shadow root, so our own CSS is unaffected. */
const SHADOW_CSS = `
	tv-overlay,
	.controls-container,
	.touch-overlay,
	.player-controls,
	.scrim,
	.metadata,
	.progress-bar {
		display: none !important;
		opacity: 0 !important;
		visibility: hidden !important;
		pointer-events: none !important;
	}
`;

let observer: MutationObserver | null = null;
let reported = false;
let clearedSlots = false;

function ownVideo(): HTMLVideoElement | null {
	return document.querySelector<HTMLVideoElement>('video.castMediaElement');
}

/** The element actually showing media: ours if it has data, else any <video> the SDK is playing. */
function liveMedia(): HTMLMediaElement | null {
	const own = ownVideo();
	if (own !== null && (own.readyState >= 2 || own.videoWidth > 0 || own.currentTime > 0)) return own;
	for (const candidate of Array.from(document.querySelectorAll('video, audio'))) {
		const media = candidate as HTMLMediaElement;
		if (media.readyState >= 2 || media.currentTime > 0) return media;
	}
	return null;
}

/** SDK web components: a dash in the tag name, and not part of our overlay. */
function sdkComponents(): Element[] {
	const app = document.getElementById('app');
	return Array.from(document.querySelectorAll('*')).filter(
		(el) => el.tagName.includes('-') && (app === null || !app.contains(el)),
	);
}

function injectShadowStyle(root: ShadowRoot): void {
	if (root.querySelector(`#${STYLE_ID}`) !== null) return;
	const style = document.createElement('style');
	style.id = STYLE_ID;
	style.textContent = SHADOW_CSS;
	root.appendChild(style);
}

function hide(element: Element): void {
	const styled = element as HTMLElement;
	if (styled.style === undefined) return;
	styled.style.setProperty('display', 'none', 'important');
	styled.style.setProperty('visibility', 'hidden', 'important');
	styled.style.setProperty('pointer-events', 'none', 'important');
}

function apply(): void {
	const components = sdkComponents();
	const live = liveMedia();
	const hidden: string[] = [];
	const kept: string[] = [];
	const shadows: string[] = [];

	for (const component of components) {
		const root = (component as { shadowRoot?: ShadowRoot }).shadowRoot;
		if (root !== null && root !== undefined) {
			injectShadowStyle(root);
			shadows.push(
				`${component.tagName.toLowerCase()}{${Array.from(root.children)
					.map((c) => c.tagName.toLowerCase())
					.join('|')}}`,
			);
		}
		// The invariant: a component holding the picture must stay visible.
		if (live !== null && component.contains(live)) {
			kept.push(component.tagName.toLowerCase());
			continue;
		}
		hide(component);
		hidden.push(component.tagName.toLowerCase());
	}

	if (!reported) {
		reported = true;
		const own = ownVideo();
		const ownership =
			live === null ? 'nothing-live' : live === own ? 'ours' : `sdk:${live.tagName.toLowerCase()}`;
		debugLog(
			`overlay scan: components=[${components.length === 0 ? 'none' : components.map((c) => c.tagName.toLowerCase()).join(', ')}]` +
				` live=${ownership} hidden=[${hidden.join(', ') || 'none'}] kept=[${kept.join(', ') || 'none'}]` +
				` shadows=[${shadows.join(', ') || 'none'}]`,
		);
	}
	if (hidden.length > 0) debugLog(`native UI hidden: ${hidden.join(', ')}`);
}

/** Drops CAF's default slot buttons (the circular 30s-skip pair). */
function clearDefaultControls(): void {
	if (clearedSlots) return;
	const ui = (cast.framework as { ui?: typeof cast.framework.ui }).ui;
	const controls = ui?.Controls?.getInstance();
	if (controls === undefined) {
		debugLog('native UI: ui.Controls unavailable (dev shim)');
		return;
	}
	try {
		controls.clearDefaultSlotAssignments();
		clearedSlots = true;
		debugLog('native UI: default control slots cleared');
	} catch (e) {
		debugLog(`native UI: clearDefaultSlotAssignments failed - ${String(e)}`);
	}
}

/** Extra passes: the overlay is created lazily and shown for ~5s after a status request. */
const LATE_PASSES_MS = [1000, 3000, 6000, 10000];

/**
 * Suppresses the built-in overlay and keeps it suppressed. Safe to call repeatedly — after
 * `ctx.start()` and again on PLAYER_LOAD_COMPLETE / PLAYING.
 */
export function hideNativeUi(): void {
	try {
		apply();
		clearDefaultControls();
		for (const delay of LATE_PASSES_MS) {
			setTimeout(() => {
				try {
					apply();
				} catch {
					// Never let a DOM hiccup surface during playback.
				}
			}, delay);
		}
		if (observer === null) {
			// childList only, no subtree: with subtree our own dialogs mutating #app re-triggered this
			// on every open/close, which is exactly when the overlay was seen coming back.
			observer = new MutationObserver(() => {
				try {
					apply();
				} catch {
					// ignore
				}
			});
			observer.observe(document.body, { childList: true });
		}
	} catch (e) {
		debugLog(`native UI suppression failed - ${String(e)}`);
	}
}
