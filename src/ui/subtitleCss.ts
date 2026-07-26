/**
 * Subtitle style → CSS, kept pure so the phone/TV parity rules are testable.
 *
 * The phone sends its RAW preference values and renders them itself (PlayerSubtitleView.kt), so the
 * receiver has to reproduce that renderer's semantics exactly or the same number means two
 * different sizes:
 *
 * - `textSize` is applied by the Android renderers as **sp**, i.e. device pixels on a surface
 *   [SP_REFERENCE_HEIGHT_DP] tall. Interpreting it as pixels on a 1080-tall canvas made it ~2.6x too
 *   small (exactly the phone's density × fontScale) — and only ~15px on a 720p receiver viewport.
 *   Mapping sp → vh against a reference height keeps the relative size identical on any screen,
 *   independent of the receiver's CSS viewport.
 * - `outlineWidth` is a percentage of the text size, drawn on the phone as a Compose `Stroke`
 *   CENTRED on the glyph contour, so half of it shows outside. `-webkit-text-stroke` is centred
 *   too, so the width must be passed through as-is: doubling it (as we used to) made the outline
 *   twice as thick relative to the text.
 * - `letterSpacing` is hundredths of an em on both sides.
 */

import { argbToCss, type CastSubtitleStyle } from '../cast/protocol';

/**
 * Height in dp of the surface these sp values are read against.
 *
 * 540dp is the Android TV layout height for a 1080p screen (density 2.0), i.e. exactly what the
 * Terebi TV app renders on — the closest analogue to this receiver, so the same `textSize` looks the
 * same on both. A phone in landscape is only ~400dp tall, and calibrating against that made cast
 * subtitles noticeably larger than the phone's and the TV app's at identical settings.
 */
export const SP_REFERENCE_HEIGHT_DP = 540;

/** Line-height multiplier; also spaces stacked cues by their VTT line row. */
export const LINE_HEIGHT_FACTOR = 1.3;

/** Bottom margin as a fraction of the player height (matches the phone's bottomPaddingFraction). */
export const BOTTOM_FRACTION = 0.06;

export interface SubtitleCss {
	/** Font size in vh — also the unit the cue row offsets are expressed in. */
	fontSizeVh: number;
	fontWeight: string;
	fontStyle: 'italic' | 'normal';
	letterSpacingEm: number;
	/** `-webkit-text-stroke-width` in em (centred stroke, like the phone's). */
	strokeWidthEm: number;
	fillColor: string;
	edgeColor: string;
}

export function subtitleCss(style: CastSubtitleStyle): SubtitleCss {
	return {
		fontSizeVh: (style.textSize / SP_REFERENCE_HEIGHT_DP) * 100,
		fontWeight: String(style.fontWeight >= 1 ? Math.min(style.fontWeight, 1000) : 700),
		fontStyle: style.italic ? 'italic' : 'normal',
		letterSpacingEm: style.letterSpacing / 100,
		strokeWidthEm: style.outlineWidth / 100,
		// 0 = "unset" on the wire; fall back to the classic white-on-black caption look.
		fillColor: style.textColor === 0 ? '#FFFFFF' : argbToCss(style.textColor),
		edgeColor: style.edgeColor === 0 ? '#000000' : argbToCss(style.edgeColor),
	};
}
