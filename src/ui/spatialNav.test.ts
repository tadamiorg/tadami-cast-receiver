import { describe, expect, it } from 'vitest';
import { pickNeighbor, type NavRect } from './spatialNav';

/** The real overlay geometry on a 1280x720 receiver viewport. */
const timeline: NavRect = { left: 60, right: 1220, top: 580, bottom: 620 };
const sourceChip: NavRect = { left: 60, right: 200, top: 630, bottom: 670 };
const subtitleChip: NavRect = { left: 210, right: 350, top: 630, bottom: 670 };
const audioChip: NavRect = { left: 360, right: 500, top: 630, bottom: 670 };
const episodesBtn: NavRect = { left: 1080, right: 1128, top: 626, bottom: 674 };
const skipBtn: NavRect = { left: 1140, right: 1220, top: 630, bottom: 670 };
const playBtn: NavRect = { left: 610, right: 670, top: 330, bottom: 390 };

describe('pickNeighbor', () => {
	it('reaches the source chip from the bottom-right buttons when the chips between are absent', () => {
		// The reported bug: with no audio track (and the subtitle chip disabled, so not focusable),
		// Left from the episodes button used to land on the timeline — the closer centre, wrong row —
		// leaving the source chip unreachable.
		const candidates = [timeline, sourceChip, skipBtn];
		expect(pickNeighbor(episodesBtn, candidates, 'left')).toBe(1);
	});

	it('walks the chip row right to left, one chip at a time', () => {
		const row = [timeline, sourceChip, subtitleChip, audioChip, episodesBtn, skipBtn];
		expect(pickNeighbor(skipBtn, row, 'left')).toBe(4); // episodes
		expect(pickNeighbor(episodesBtn, row, 'left')).toBe(3); // audio
		expect(pickNeighbor(audioChip, row, 'left')).toBe(2); // subtitle
		expect(pickNeighbor(subtitleChip, row, 'left')).toBe(1); // source
		expect(pickNeighbor(sourceChip, row, 'left')).toBeNull(); // row start
	});

	it('walks the chip row left to right without jumping to the timeline', () => {
		const row = [timeline, sourceChip, subtitleChip, episodesBtn, skipBtn];
		expect(pickNeighbor(sourceChip, row, 'right')).toBe(2); // subtitle
		expect(pickNeighbor(subtitleChip, row, 'right')).toBe(3); // episodes
		expect(pickNeighbor(episodesBtn, row, 'right')).toBe(4); // +85s
		expect(pickNeighbor(skipBtn, row, 'right')).toBeNull(); // row end
	});

	it('still leaves the row vertically (chips <-> timeline <-> transport)', () => {
		const all = [timeline, sourceChip, episodesBtn, skipBtn, playBtn];
		// Up from any chip reaches the timeline, which spans the width so it always overlaps.
		expect(pickNeighbor(sourceChip, all, 'up')).toBe(0);
		expect(pickNeighbor(skipBtn, all, 'up')).toBe(0);
		// Up from the timeline continues to the transport row.
		expect(pickNeighbor(timeline, all, 'up')).toBe(4);
		// Down from the timeline comes back into the chip row.
		expect([1, 2, 3]).toContain(pickNeighbor(timeline, all, 'down'));
	});

	it('falls back to raw distance when nothing is aligned', () => {
		// Play button (centre, high) → down: no element overlaps its narrow column except the timeline.
		expect(pickNeighbor(playBtn, [timeline, sourceChip], 'down')).toBe(0);
		// A chip far off to the side with nothing in its column still finds the row above.
		const lonely: NavRect = { left: 20, right: 60, top: 700, bottom: 716 };
		expect(pickNeighbor(lonely, [episodesBtn], 'up')).toBe(0);
	});

	it('returns null when there is nothing in that direction', () => {
		expect(pickNeighbor(sourceChip, [], 'left')).toBeNull();
		expect(pickNeighbor(sourceChip, [sourceChip], 'right')).toBeNull();
		expect(pickNeighbor(timeline, [sourceChip], 'up')).toBeNull();
	});
});
