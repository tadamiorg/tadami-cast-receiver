import { blockingNotice, hasMedia } from '../player/store';
import { IdleScreen } from './IdleScreen';
import { PlayerOverlay } from './PlayerOverlay';
import { SubtitleView } from './SubtitleView';
import './tokens.css';
import './global.css';

export function App() {
	return (
		<div class="root" data-focus-layer>
			<SubtitleView />
			{!hasMedia.value && <IdleScreen />}
			<PlayerOverlay />
			{blockingNotice.value !== null && (
				<div class="blocking-notice">
					<p>{blockingNotice.value}</p>
				</div>
			)}
		</div>
	);
}
