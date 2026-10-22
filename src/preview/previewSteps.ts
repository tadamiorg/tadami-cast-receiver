/**
 * Seekbar preview steps — a port of the phone's SeekPreviewLogic.kt (previewBucketSizeMs /
 * previewBucketOf). One frame per step: 1% of the duration, so about 100 frames per video, but 5 s
 * at least and 30 s at most. The phone decodes step N of a request with the same rule, from the
 * duration the request carries, so both sides agree on what a step is.
 */

export const PREVIEW_STEP_MIN_MS = 5_000;
export const PREVIEW_STEP_MAX_MS = 30_000;

/** Length of a preview step of a [durationMs]-long video. */
export function previewStepSizeMs(durationMs: number): number {
	const onePercent = Math.floor(Math.max(0, durationMs) / 100);
	return Math.min(PREVIEW_STEP_MAX_MS, Math.max(PREVIEW_STEP_MIN_MS, onePercent));
}

/** The preview step [positionMs] falls in; positions out of the video belong to its first or last step. */
export function previewStepOf(positionMs: number, durationMs: number): number {
	const last = Math.max(0, Math.floor(durationMs) - 1);
	const clamped = Math.min(Math.max(0, Math.floor(positionMs)), last);
	return Math.floor(clamped / previewStepSizeMs(durationMs));
}
