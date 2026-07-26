/** Full-screen scrimmed spinner (loading) and bare centered spinner (rebuffer). */

import './overlay.css';

export function LoadingOverlay() {
	return (
		<div class="loading-overlay">
			<div class="spinner" />
		</div>
	);
}

export function BufferingSpinner() {
	return (
		<div class="buffering-overlay">
			<div class="spinner" />
		</div>
	);
}
