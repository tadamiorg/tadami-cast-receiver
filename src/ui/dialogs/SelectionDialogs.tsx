/** Source / Episode / Subtitle (with Off first) / Audio pickers — ports of TvSelectionDialogs.kt. */

import {
	episodeLabel,
	sourceLabel,
	type AudioTrack,
	type StreamSource,
	type SubtitleTrack,
	type TvEpisode,
} from '../../cast/protocol';
import { DialogRow, DialogScaffold } from './DialogScaffold';

export function SourceDialog({
	sources,
	selectedIndex,
	onSelect,
	onDismiss,
}: {
	sources: StreamSource[];
	selectedIndex: number;
	onSelect: (index: number) => void;
	onDismiss: () => void;
}) {
	return (
		<DialogScaffold title="Video sources" onDismiss={onDismiss}>
			{sources.map((source, index) => (
				<DialogRow
					key={index}
					label={sourceLabel(source)}
					selected={index === selectedIndex}
					autoFocus={index === 0}
					onClick={() => onSelect(index)}
				/>
			))}
		</DialogScaffold>
	);
}

export function EpisodeDialog({
	episodes,
	displayMode,
	currentEpisodeId,
	onSelect,
	onDismiss,
}: {
	episodes: TvEpisode[];
	displayMode: string;
	currentEpisodeId: number;
	onSelect: (episodeId: number) => void;
	onDismiss: () => void;
}) {
	return (
		<DialogScaffold title="Episodes" onDismiss={onDismiss}>
			{episodes.map((episode, index) => (
				<DialogRow
					key={episode.id}
					label={episodeLabel(episode, displayMode)}
					selected={episode.id === currentEpisodeId}
					autoFocus={index === 0}
					onClick={() => onSelect(episode.id)}
				/>
			))}
		</DialogScaffold>
	);
}

export function SubtitleDialog({
	tracks,
	selectedIndex,
	onSelect,
	onDismiss,
}: {
	tracks: SubtitleTrack[];
	selectedIndex: number | null;
	onSelect: (index: number | null) => void;
	onDismiss: () => void;
}) {
	return (
		<DialogScaffold title="Subtitles" onDismiss={onDismiss}>
			<DialogRow
				label="Off"
				selected={selectedIndex === null}
				autoFocus
				onClick={() => onSelect(null)}
			/>
			{tracks.map((track, index) => (
				<DialogRow
					key={index}
					label={track.lang.trim() !== '' ? track.lang : `Track ${index + 1}`}
					selected={selectedIndex === index}
					onClick={() => onSelect(index)}
				/>
			))}
		</DialogScaffold>
	);
}

export function AudioDialog({
	tracks,
	selectedIndex,
	onSelect,
	onDismiss,
}: {
	tracks: AudioTrack[];
	selectedIndex: number;
	onSelect: (index: number) => void;
	onDismiss: () => void;
}) {
	return (
		<DialogScaffold title="Audio" onDismiss={onDismiss}>
			{tracks.map((track, index) => (
				<DialogRow
					key={index}
					label={track.lang.trim() !== '' ? track.lang : `Track ${index + 1}`}
					selected={selectedIndex === index}
					autoFocus={index === 0}
					onClick={() => onSelect(index)}
				/>
			))}
		</DialogScaffold>
	);
}
