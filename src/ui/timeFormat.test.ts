import { describe, expect, it } from 'vitest';
import { formatMinSec } from './timeFormat';

describe('formatMinSec', () => {
	it('clamps zero/negative/invalid to 00:00', () => {
		expect(formatMinSec(0)).toBe('00:00');
		expect(formatMinSec(-5000)).toBe('00:00');
		expect(formatMinSec(NaN)).toBe('00:00');
	});

	it('formats MM:SS under an hour', () => {
		expect(formatMinSec(1000)).toBe('00:01');
		expect(formatMinSec(65_000)).toBe('01:05');
		expect(formatMinSec(3_599_999)).toBe('59:59');
	});

	it('formats HH:MM:SS from an hour up', () => {
		expect(formatMinSec(3_600_000)).toBe('01:00:00');
		expect(formatMinSec(5_025_000)).toBe('01:23:45');
	});
});
