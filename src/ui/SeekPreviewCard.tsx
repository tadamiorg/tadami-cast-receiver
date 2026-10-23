/**
 * The seekbar preview card (the phone player's SeekPreviewThumbnail, TV-sized): the frame of the
 * scrubbed preview step above the thumb with the scrubbed time under it, or the time alone while the
 * frame loads, when the step has none or when the phone makes no preview for the stream (a
 * streamed episode). Drawn inside a positioned timeline, centred over [fraction] and kept within it.
 */

import { previewView } from '../preview/seekPreview';
import { formatMinSec } from './timeFormat';
import './overlay.css';

export function SeekPreviewCard({ fraction }: { fraction: number }) {
	const view = previewView.value;
	if (view === null) return null;
	const hasFrame = view.frame !== null;
	return (
		<div
			class={`seek-preview${hasFrame ? '' : ' seek-preview-time-only'}`}
			style={{ '--seek-preview-x': `${Math.min(1, Math.max(0, fraction)) * 100}%` }}
			data-seek-preview
		>
			{hasFrame && <img class="seek-preview-frame" src={view.frame ?? undefined} alt="" />}
			<span class="seek-preview-time">{formatMinSec(view.positionMs)}</span>
		</div>
	);
}
