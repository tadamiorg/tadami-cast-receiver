/**
 * Hidden-controls quick-seek feedback (mirrors Terebi's QuickSeekOverlay): a primary-tinted
 * flash covering the seeked half with three staggered pulsing chevrons + the accumulated
 * ±seconds, plus a minimal bottom timeline.
 */

import { durationMs } from '../player/store';
import { PlayArrowIcon } from './icons';
import { formatMinSec } from './timeFormat';
import './overlay.css';

export function QuickSeekOverlay({ accumSec, positionMs }: { accumSec: number; positionMs: number }) {
	const forward = accumSec >= 0;
	const duration = durationMs.value;
	const fraction = duration > 0 ? Math.min(1, Math.max(0, positionMs / duration)) : 0;

	// Pulse phases mirror SeekAnimation: 0/200/400 ms offsets, order flipped when rewinding.
	const delays = forward ? [0, -200, -400] : [-400, -200, 0];

	return (
		<div class="qs-root">
			<div class={`qs-zone ${forward ? 'qs-forward' : 'qs-back'}`}>
				<div class="qs-content">
					<div class="qs-chevrons">
						{delays.map((delay, i) => (
							<span
								key={i}
								class={`qs-chevron${forward ? '' : ' qs-rev'}`}
								style={{ animationDelay: `${delay}ms` }}
							>
								<PlayArrowIcon size={30} />
							</span>
						))}
					</div>
					<div class="qs-seconds">{`${forward ? '+' : '-'}${Math.abs(accumSec)}s`}</div>
				</div>
			</div>
			<div class="qs-bar">
				<span class="time-label">{formatMinSec(positionMs)}</span>
				<div class="qs-bar-track">
					<div class="qs-bar-fill" style={{ width: `${fraction * 100}%` }} />
				</div>
				<span class="time-label">{formatMinSec(duration)}</span>
			</div>
		</div>
	);
}
