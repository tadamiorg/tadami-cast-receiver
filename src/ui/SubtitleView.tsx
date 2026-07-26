/**
 * Custom subtitle renderer (CAF's TextTrackStyle cannot express the Tadami look: outline
 * as a fraction of the font size, weight 700, line-height 1.3, 6% bottom margin, live
 * restyle). Two stacked spans per cue: an under-layer drawing the outline with
 * -webkit-text-stroke (works on frozen Chrome runtimes where paint-order doesn't) and an
 * over-layer drawing the fill.
 *
 * All the phone-parity arithmetic lives in ./subtitleCss (pure + unit-tested).
 */

import { activeCues } from '../player/subtitles/subtitleEngine';
import { hasMedia, subtitleStyle } from '../player/store';
import { BOTTOM_FRACTION, LINE_HEIGHT_FACTOR, subtitleCss } from './subtitleCss';
import './subtitles.css';

export function SubtitleView() {
	const cues = activeCues.value;
	if (!hasMedia.value || cues.length === 0) return null;

	const css = subtitleCss(subtitleStyle.value);

	const textStyle = {
		fontSize: `${css.fontSizeVh}vh`,
		lineHeight: LINE_HEIGHT_FACTOR,
		fontWeight: css.fontWeight,
		fontStyle: css.fontStyle,
		letterSpacing: `${css.letterSpacingEm}em`,
	};

	// Rows: the parser's line is the cue's bottom row (-2 → row 0, -3 → one row up, …).
	// Cues without a usable line stack bottom-up in order so they never overlap.
	let autoRow = 0;
	const rows = cues.map((cue) =>
		cue.line !== null && cue.line < 0 ? Math.max(0, -cue.line - 2) : autoRow++,
	);

	return (
		<div class="subtitle-layer">
			{cues.map((cue, i) => (
				<div
					class="subtitle-cue"
					key={`${cue.text}-${i}`}
					style={{
						bottom: `calc(${BOTTOM_FRACTION * 100}% + ${rows[i] * css.fontSizeVh * LINE_HEIGHT_FACTOR}vh)`,
					}}
				>
					<div class="subtitle-text" style={textStyle}>
						<span
							class="subtitle-under"
							style={{
								color: css.edgeColor,
								WebkitTextStrokeWidth: `${css.strokeWidthEm}em`,
								WebkitTextStrokeColor: css.edgeColor,
							}}
						>
							{cue.text}
						</span>
						<span class="subtitle-over" style={{ color: css.fillColor }}>
							{cue.text}
						</span>
					</div>
				</div>
			))}
		</div>
	);
}
