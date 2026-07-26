/**
 * Roving D-pad/keyboard focus for the TV overlay. Google TV remotes reach a web receiver as
 * plain keyboard events (ArrowKeys / Enter / Escape-or-back); with no key events the UI
 * degrades to display-only, exactly like Terebi on a remote-less dongle.
 *
 * Two window listeners:
 *  - capture phase: the registered "preview" interceptor (PlayerOverlay's key state
 *    machine — BACK handling, hidden-controls quick-seek, poke). Mirrors Compose's
 *    onPreviewKeyEvent.
 *  - bubble phase: geometric arrow navigation between `[data-focusable]` elements inside
 *    the top-most visible `[data-focus-layer]`, Enter → click. Elements that self-handle
 *    keys (the seek timeline) stopPropagation() in their own handler.
 */

import { pickNeighbor, type Direction } from './spatialNav';

export type KeyInterceptor = (event: KeyboardEvent) => boolean;

let previewInterceptor: KeyInterceptor | null = null;

export function setKeyInterceptor(interceptor: KeyInterceptor | null): void {
	previewInterceptor = interceptor;
}

export function isBackKey(event: KeyboardEvent): boolean {
	return (
		event.key === 'Escape' ||
		event.key === 'GoBack' ||
		event.key === 'BrowserBack' ||
		event.key === 'XF86Back' ||
		event.keyCode === 27 ||
		event.keyCode === 461 ||
		event.keyCode === 10009
	);
}

export function isEnterKey(event: KeyboardEvent): boolean {
	return event.key === 'Enter' || event.key === 'Select' || event.keyCode === 13;
}

function directionOf(event: KeyboardEvent): Direction | null {
	switch (event.key) {
		case 'ArrowUp':
			return 'up';
		case 'ArrowDown':
			return 'down';
		case 'ArrowLeft':
			return 'left';
		case 'ArrowRight':
			return 'right';
		default:
			return null;
	}
}

function isVisible(el: HTMLElement): boolean {
	return el.offsetParent !== null || el.getClientRects().length > 0;
}

function activeLayer(): HTMLElement | null {
	const layers = Array.from(
		document.querySelectorAll<HTMLElement>('[data-focus-layer]'),
	).filter(isVisible);
	return layers.length > 0 ? layers[layers.length - 1] : null;
}

function focusables(layer: HTMLElement): HTMLElement[] {
	return Array.from(layer.querySelectorAll<HTMLElement>('[data-focusable]')).filter(
		(el) => isVisible(el) && el.getAttribute('aria-disabled') !== 'true',
	);
}

/** Focuses the first focusable in the given (or active) layer. */
export function focusFirst(layer?: HTMLElement | null): boolean {
	const target = layer ?? activeLayer();
	if (target === null) return false;
	const items = focusables(target);
	if (items.length === 0) return false;
	items[0].focus();
	return true;
}

function moveFocus(direction: Direction): boolean {
	const layer = activeLayer();
	if (layer === null) return false;
	const items = focusables(layer);
	if (items.length === 0) return false;

	const active = document.activeElement;
	const current = active instanceof HTMLElement && items.includes(active) ? active : null;
	if (current === null) {
		items[0].focus();
		return true;
	}

	// Geometry lives in ./spatialNav (pure + unit-tested): same-row candidates win over closer ones
	// in another row, so a wide element like the timeline can't swallow navigation along a row.
	const others = items.filter((el) => el !== current);
	const index = pickNeighbor(
		current.getBoundingClientRect(),
		others.map((el) => el.getBoundingClientRect()),
		direction,
	);
	if (index === null) return false;
	others[index].focus();
	return true;
}

function onCaptureKeyDown(event: KeyboardEvent): void {
	if (previewInterceptor !== null && previewInterceptor(event)) {
		event.preventDefault();
		event.stopPropagation();
	}
}

function onBubbleKeyDown(event: KeyboardEvent): void {
	const direction = directionOf(event);
	if (direction !== null) {
		moveFocus(direction);
		// Own every arrow key: prevent default AND stop it here so nothing else (the SDK, the media
		// element's own key handling) ever acts on it.
		// (Self-handling elements like the seek timeline stopPropagation earlier, so this
		// branch only runs for plain navigation — safe to swallow.)
		event.preventDefault();
		event.stopImmediatePropagation();
		return;
	}
	if (isEnterKey(event) || isBackKey(event)) {
		if (isEnterKey(event)) {
			const active = document.activeElement;
			if (active instanceof HTMLElement && active.hasAttribute('data-focusable')) {
				if (active.getAttribute('aria-disabled') !== 'true') active.click();
			}
		}
		event.preventDefault();
		event.stopImmediatePropagation();
	}
}

export function initFocus(): void {
	window.addEventListener('keydown', onCaptureKeyDown, true);
	window.addEventListener('keydown', onBubbleKeyDown, false);
}
