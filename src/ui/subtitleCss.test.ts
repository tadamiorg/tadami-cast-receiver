import { describe, expect, it } from 'vitest';
import { DEFAULT_SUBTITLE_STYLE, type CastSubtitleStyle } from '../cast/protocol';
import { SP_REFERENCE_HEIGHT_DP, subtitleCss } from './subtitleCss';

function style(overrides: Partial<CastSubtitleStyle> = {}): CastSubtitleStyle {
	return { ...DEFAULT_SUBTITLE_STYLE, ...overrides };
}

describe('subtitleCss', () => {
	it('maps textSize (sp) to vh against the TV reference height', () => {
		// Android TV lays 1080p out at 540dp, so 24sp is 48px there — 4.44% of the height. Matching
		// that keeps the receiver in step with the TV app instead of the (shorter) phone view.
		expect(subtitleCss(style({ textSize: 24 })).fontSizeVh).toBeCloseTo(4.4444, 3);
		expect(subtitleCss(style({ textSize: SP_REFERENCE_HEIGHT_DP })).fontSizeVh).toBe(100);
		expect(subtitleCss(style({ textSize: 12 })).fontSizeVh).toBeCloseTo(2.2222, 3);
	});

	it('lands in the broadcast-caption range at the default size', () => {
		const vh = subtitleCss(style({ textSize: 24 })).fontSizeVh;
		expect(vh).toBeGreaterThan(4);
		expect(vh).toBeLessThan(6);
	});

	it('passes the outline through as a centred stroke (no doubling)', () => {
		// Phone: Stroke(width = textSize * outlineWidth/100) centred on the glyph. -webkit-text-stroke
		// is centred too, so the same em value yields the same visible thickness.
		expect(subtitleCss(style({ outlineWidth: 35 })).strokeWidthEm).toBeCloseTo(0.35, 5);
		expect(subtitleCss(style({ outlineWidth: 0 })).strokeWidthEm).toBe(0);
	});

	it('treats letterSpacing as hundredths of an em', () => {
		expect(subtitleCss(style({ letterSpacing: 2 })).letterSpacingEm).toBeCloseTo(0.02, 5);
		expect(subtitleCss(style({ letterSpacing: 0 })).letterSpacingEm).toBe(0);
	});

	it('clamps font weight and falls back to 700 for unset values', () => {
		expect(subtitleCss(style({ fontWeight: 400 })).fontWeight).toBe('400');
		expect(subtitleCss(style({ fontWeight: 5000 })).fontWeight).toBe('1000');
		expect(subtitleCss(style({ fontWeight: 0 })).fontWeight).toBe('700');
	});

	it('falls back to white-on-black when a colour is unset (0)', () => {
		const css = subtitleCss(style({ textColor: 0, edgeColor: 0 }));
		expect(css.fillColor).toBe('#FFFFFF');
		expect(css.edgeColor).toBe('#000000');
	});

	it('converts ARGB colours', () => {
		// Opaque red / opaque blue as signed Android ARGB ints.
		const css = subtitleCss(style({ textColor: 0xffff0000 | 0, edgeColor: 0xff0000ff | 0 }));
		expect(css.fillColor).toBe('rgba(255, 0, 0, 1)');
		expect(css.edgeColor).toBe('rgba(0, 0, 255, 1)');
	});

	it('honours italic', () => {
		expect(subtitleCss(style({ italic: true })).fontStyle).toBe('italic');
		expect(subtitleCss(style({ italic: false })).fontStyle).toBe('normal');
	});
});
