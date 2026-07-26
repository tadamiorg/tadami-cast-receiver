/**
 * The controls scrim — a faithful port of Terebi's ControlsScrim: title/episode top-left,
 * prev/play-pause-replay/next center transport, seek bar + selector chips + episodes +
 * "+85s" bottom.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import * as store from '../player/store';
import { formatMinSec } from './timeFormat';
import {
	AudiotrackIcon,
	PauseIcon,
	PlayArrowIcon,
	PlaylistPlayIcon,
	ReplayIcon,
	SkipNextIcon,
	SkipPreviousIcon,
	SubtitlesIcon,
	VideoSettingsIcon,
} from './icons';
import './overlay.css';

const SEEK_STEP_MS = 10_000;
/** Scrub commit debounce for the focused timeline (PlaybackScreen's SeekTimeline). */
const SCRUB_COMMIT_MS = 600;

export interface ControlsScrimProps {
	onPlayPause: () => void;
	onReplay: () => void;
	onSkipOp: () => void;
	onSeek: (ms: number) => void;
	onNext: () => void;
	onPrevious: () => void;
	onSources: () => void;
	onSubtitles: () => void;
	onAudio: () => void;
	onEpisodes: () => void;
}

export function ControlsScrim(props: ControlsScrimProps) {
	const title = store.title.value;
	const episodeLabel = store.episodeLabelText.value;
	const isPlaying = store.isPlaying.value;
	const isEnded = store.ended.value;
	const sources = store.sources.value;
	const selectedSource = store.selectedSourceIndex.value;
	const subtitleTracks = store.subtitles.value;
	const subtitleIndex = store.selectedSubtitleIndex.value;
	const audio = store.audioTracks.value;
	const audioIndex = store.selectedAudioIndex.value;

	const sourceLabelText = sources[selectedSource]?.fullName?.trim()
		? sources[selectedSource].fullName
		: (`${sources[selectedSource]?.server ?? ''} ${sources[selectedSource]?.quality ?? ''}`.trim() ||
			'Source');
	const subtitleLabelText =
		subtitleTracks.length === 0
			? 'Subtitles'
			: subtitleIndex !== null
				? subtitleTracks[subtitleIndex]?.lang?.trim() || `Track ${subtitleIndex + 1}`
				: 'Off';
	const audioLabelText = audio[audioIndex]?.lang?.trim() || 'Audio';

	return (
		<div class="scrim">
			{/* Top-left: anime title (bold) + episode (italic). */}
			<div class="scrim-top">
				<div class="scrim-title">{title}</div>
				{episodeLabel.trim() !== '' && <div class="scrim-episode">{episodeLabel}</div>}
			</div>

			{/* Center transport — the topmost focusable row; UP here collapses the controls
			    (handled by the PlayerOverlay key interceptor via data-up-dismiss). */}
			<div class="transport" data-up-dismiss>
				<PlayerIconButton
					onClick={props.onPrevious}
					disabled={!store.hasPrevious.value}
					buttonSize={56}
					iconSize={32}
					label="Previous episode"
				>
					<SkipPreviousIcon size={32} />
				</PlayerIconButton>
				<PlayerIconButton
					onClick={isEnded ? props.onReplay : props.onPlayPause}
					buttonSize={76}
					iconSize={44}
					label={isEnded ? 'Replay' : 'Play / pause'}
					autoFocusPlay
				>
					{isEnded ? (
						<ReplayIcon size={44} />
					) : isPlaying ? (
						<PauseIcon size={44} />
					) : (
						<PlayArrowIcon size={44} />
					)}
				</PlayerIconButton>
				<PlayerIconButton
					onClick={props.onNext}
					disabled={!store.hasNext.value}
					buttonSize={56}
					iconSize={32}
					label="Next episode"
				>
					<SkipNextIcon size={32} />
				</PlayerIconButton>
			</div>

			{/* Bottom: seek bar, then selector chips + episodes + "+85s". */}
			<div class="scrim-bottom">
				<SeekBarRow onSeek={props.onSeek} />
				<div class="chip-row">
					<div class="chip-group">
						{sources.length > 1 && (
							<PlayerChip label={sourceLabelText} onClick={props.onSources}>
								<VideoSettingsIcon size={20} />
							</PlayerChip>
						)}
						<PlayerChip
							label={subtitleLabelText}
							onClick={props.onSubtitles}
							disabled={subtitleTracks.length === 0}
						>
							<SubtitlesIcon size={20} />
						</PlayerChip>
						{audio.length > 1 && (
							<PlayerChip label={audioLabelText} onClick={props.onAudio}>
								<AudiotrackIcon size={20} />
							</PlayerChip>
						)}
					</div>
					<div class="chip-group">
						{store.episodes.value.length > 0 && (
							<PlayerIconButton onClick={props.onEpisodes} buttonSize={48} iconSize={26} label="Episodes">
								<PlaylistPlayIcon size={26} />
							</PlayerIconButton>
						)}
						<div class="skip-btn" data-focusable tabIndex={-1} onClick={props.onSkipOp} role="button">
							+85s
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

/**
 * Time labels + D-pad-seekable timeline. Reads positionMs HERE so the 2 Hz ticker only
 * re-renders this row (Terebi isolates it the same way).
 */
function SeekBarRow({ onSeek }: { onSeek: (ms: number) => void }) {
	const position = store.positionMs.value;
	const duration = store.durationMs.value;
	const seekable = duration > 0;

	const [scrubMs, setScrubMs] = useState<number | null>(null);
	const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const scrubRef = useRef<number | null>(null);
	scrubRef.current = scrubMs;

	const clearCommitTimer = () => {
		if (commitTimer.current !== null) {
			clearTimeout(commitTimer.current);
			commitTimer.current = null;
		}
	};

	const commit = () => {
		clearCommitTimer();
		const target = scrubRef.current;
		if (target !== null) {
			onSeek(target);
			setScrubMs(null);
		}
	};

	// Commit ~600 ms after the last LEFT/RIGHT press.
	const scheduleCommit = () => {
		clearCommitTimer();
		commitTimer.current = setTimeout(commit, SCRUB_COMMIT_MS);
	};

	useEffect(() => clearCommitTimer, []);

	const onKeyDown = (event: KeyboardEvent) => {
		if (!seekable) return;
		let handled = true;
		switch (event.key) {
			case 'ArrowLeft':
				setScrubMs(Math.max(0, (scrubRef.current ?? position) - SEEK_STEP_MS));
				scheduleCommit();
				break;
			case 'ArrowRight':
				setScrubMs(Math.min(duration, (scrubRef.current ?? position) + SEEK_STEP_MS));
				scheduleCommit();
				break;
			case 'Enter':
				commit();
				break;
			default:
				handled = false;
		}
		if (handled) {
			event.preventDefault();
			event.stopPropagation();
		}
	};

	const displayMs = scrubMs ?? position;
	const fraction = duration > 0 ? Math.min(1, Math.max(0, displayMs / duration)) : 0;

	return (
		<div class="seek-row">
			<span class="time-label">{formatMinSec(displayMs)}</span>
			<div class="timeline" data-focusable tabIndex={-1} onKeyDown={onKeyDown} onBlur={commit}>
				<div class="timeline-track">
					<div class="timeline-fill" style={{ width: `${fraction * 100}%` }} />
				</div>
				{seekable && <div class="timeline-thumb" style={{ left: `${fraction * 100}%` }} />}
			</div>
			<span class="time-label">{formatMinSec(duration)}</span>
		</div>
	);
}

function PlayerIconButton({
	onClick,
	children,
	label,
	disabled = false,
	buttonSize = 48,
	iconSize = 26,
	autoFocusPlay = false,
}: {
	onClick: () => void;
	children: ComponentChildren;
	label: string;
	disabled?: boolean;
	buttonSize?: number;
	iconSize?: number;
	autoFocusPlay?: boolean;
}) {
	void iconSize;
	return (
		<div
			class="picon-btn"
			role="button"
			aria-label={label}
			aria-disabled={disabled ? 'true' : undefined}
			data-focusable={disabled ? undefined : ''}
			data-play-focus={autoFocusPlay ? '' : undefined}
			tabIndex={-1}
			style={{ width: `${buttonSize}px`, height: `${buttonSize}px` }}
			onClick={disabled ? undefined : onClick}
		>
			{children}
		</div>
	);
}

function PlayerChip({
	label,
	onClick,
	children,
	disabled = false,
}: {
	label: string;
	onClick: () => void;
	children: ComponentChildren;
	disabled?: boolean;
}) {
	return (
		<div
			class="chip"
			role="button"
			aria-disabled={disabled ? 'true' : undefined}
			data-focusable={disabled ? undefined : ''}
			tabIndex={-1}
			onClick={disabled ? undefined : onClick}
		>
			{children}
			<span class="chip-label">{label}</span>
		</div>
	);
}
