/**
 * D-pad neighbour selection, kept pure so the geometry is testable without a DOM.
 *
 * Plain "nearest centre, cross-axis weighted" scoring breaks around wide elements: pressing Left
 * from the bottom-right buttons used to land on the seek timeline (one row up, centre only ~490px
 * away) instead of the source chip on the same row (~1030px away), which made that chip unreachable
 * whenever the chips between them were absent or disabled.
 *
 * So alignment is decided FIRST: a candidate whose cross-axis range overlaps the current element's
 * counts as "same row" (for left/right) or "same column" (for up/down), and those always win. Only
 * when a direction has no aligned candidate does the search fall back to raw distance, which is what
 * lets you leave a row (chips → timeline via Up).
 */

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface NavRect {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

/** Cross-axis drift weight for ranking within one row/column. */
const CROSS_AXIS_WEIGHT = 3;
/** A centre must move at least this far in the pressed direction to count as a candidate. */
const MIN_DELTA = 1;

function centerX(rect: NavRect): number {
	return (rect.left + rect.right) / 2;
}

function centerY(rect: NavRect): number {
	return (rect.top + rect.bottom) / 2;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
	return Math.min(aEnd, bEnd) - Math.max(aStart, bStart) > 0;
}

/** Index of the element focus should move to, or null when nothing lies that way. */
export function pickNeighbor(
	current: NavRect,
	candidates: NavRect[],
	direction: Direction,
): number | null {
	let aligned = -1;
	let alignedScore = Infinity;
	let any = -1;
	let anyScore = Infinity;

	candidates.forEach((rect, index) => {
		const dx = centerX(rect) - centerX(current);
		const dy = centerY(rect) - centerY(current);
		let primary: number;
		let secondary: number;
		let sameBand: boolean;

		switch (direction) {
			case 'left':
				if (dx >= -MIN_DELTA) return;
				primary = -dx;
				secondary = Math.abs(dy);
				sameBand = overlaps(current.top, current.bottom, rect.top, rect.bottom);
				break;
			case 'right':
				if (dx <= MIN_DELTA) return;
				primary = dx;
				secondary = Math.abs(dy);
				sameBand = overlaps(current.top, current.bottom, rect.top, rect.bottom);
				break;
			case 'up':
				if (dy >= -MIN_DELTA) return;
				primary = -dy;
				secondary = Math.abs(dx);
				sameBand = overlaps(current.left, current.right, rect.left, rect.right);
				break;
			case 'down':
				if (dy <= MIN_DELTA) return;
				primary = dy;
				secondary = Math.abs(dx);
				sameBand = overlaps(current.left, current.right, rect.left, rect.right);
				break;
		}

		const score = primary + secondary * CROSS_AXIS_WEIGHT;
		if (sameBand && score < alignedScore) {
			alignedScore = score;
			aligned = index;
		}
		if (score < anyScore) {
			anyScore = score;
			any = index;
		}
	});

	if (aligned >= 0) return aligned;
	return any >= 0 ? any : null;
}
