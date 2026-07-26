/** Ported from Terebi's TimeFormat.kt / the phone's NumberExtensions.formatMinSec(). */
export function formatMinSec(ms: number): string {
	if (!Number.isFinite(ms) || ms <= 0) return '00:00';
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	const mm = String(minutes).padStart(2, '0');
	const ss = String(seconds).padStart(2, '0');
	if (hours > 0) {
		return `${String(hours).padStart(2, '0')}:${mm}:${ss}`;
	}
	return `${mm}:${ss}`;
}
