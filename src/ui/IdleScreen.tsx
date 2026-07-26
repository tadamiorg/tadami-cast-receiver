/**
 * Shown on cold start and whenever no media is loaded (mirrors Terebi's IdleScreen):
 * the tada logo tinted onBackground, the wordmark, and a spinner.
 */

import { TadaLogo } from './icons';
import './idle.css';

export function IdleScreen() {
	return (
		<div class="idle">
			<TadaLogo class="idle-logo" />
			<div class="idle-wordmark">Tadami</div>
			<div class="spinner" />
		</div>
	);
}
