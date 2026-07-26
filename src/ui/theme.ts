/**
 * Runtime theming: maps the phone's TvThemeColors (ARGB ints) onto CSS custom properties.
 * Alpha variants are computed in TS (no `color-mix()` on frozen Chrome runtimes).
 * Defaults mirror Terebi's `TadamiTerebiTheme.DefaultColors`.
 */

import { argbToCss, argbWithAlphaToCss, type TvThemeColors } from '../cast/protocol';

/** Terebi DefaultColors (secondary pair = Material3 dark baseline, unused by the UI). */
export const DEFAULT_THEME: TvThemeColors = {
	primary: 0xffb0c6ff,
	onPrimary: 0xff002d6e,
	secondary: 0xffccc2dc,
	onSecondary: 0xff332d41,
	background: 0xff1b1b1f,
	onBackground: 0xffe3e2e6,
	surface: 0xff1b1b1f,
	onSurface: 0xffe3e2e6,
	surfaceVariant: 0xff2a2a30,
	onSurfaceVariant: 0xffc6c5d0,
};

export function applyTheme(colors: TvThemeColors | null): void {
	const c = colors ?? DEFAULT_THEME;
	const root = document.documentElement.style;

	root.setProperty('--color-primary', argbToCss(c.primary));
	root.setProperty('--color-on-primary', argbToCss(c.onPrimary));
	root.setProperty('--color-secondary', argbToCss(c.secondary));
	root.setProperty('--color-on-secondary', argbToCss(c.onSecondary));
	root.setProperty('--color-background', argbToCss(c.background));
	root.setProperty('--color-on-background', argbToCss(c.onBackground));
	root.setProperty('--color-surface', argbToCss(c.surface));
	root.setProperty('--color-on-surface', argbToCss(c.onSurface));
	root.setProperty('--color-surface-variant', argbToCss(c.surfaceVariant));
	root.setProperty('--color-on-surface-variant', argbToCss(c.onSurfaceVariant));

	// TS-computed alpha variants (values straight from PlaybackScreen.kt).
	root.setProperty('--scrim', argbWithAlphaToCss(c.background, 0.7));
	root.setProperty('--loading-scrim', argbWithAlphaToCss(c.background, 0.6));
	root.setProperty('--chip-bg', argbWithAlphaToCss(c.onSurface, 0.12));
	root.setProperty('--chip-bg-focused', argbWithAlphaToCss(c.onSurface, 0.28));
	root.setProperty('--chip-bg-disabled', argbWithAlphaToCss(c.onSurface, 0.06));
	root.setProperty('--button-focus-bg', argbWithAlphaToCss(c.onSurface, 0.22));
	root.setProperty('--content-disabled', argbWithAlphaToCss(c.onSurface, 0.4));
	root.setProperty('--track-bg', argbWithAlphaToCss(c.onSurface, 0.3));
	root.setProperty('--primary-tint', argbWithAlphaToCss(c.primary, 0.1));
}
