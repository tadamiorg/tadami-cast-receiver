import { render } from 'preact';
import { effect } from '@preact/signals';
import { initDebugOverlay } from './cast/debug';
import { installCrashReporter } from './cast/crashReporter';
import { theme } from './player/store';
import { App } from './ui/App';
import { initFocus, setKeyInterceptor } from './ui/focus';
import { overlayKeyInterceptor } from './ui/PlayerOverlay';
import { applyTheme } from './ui/theme';

async function boot(): Promise<void> {
	initDebugOverlay();
	installCrashReporter();

	// Desktop-Chrome dev shim: a minimal window.cast stub over a plain <video>, enabled with
	// `vite dev` + `?shim`. Must be installed before the cast controller touches the globals.
	if (import.meta.env.DEV && location.search.includes('shim')) {
		await import('./dev/shim');
	}

	// Theme: defaults immediately, live re-color whenever the phone pushes TvThemeColors.
	applyTheme(null);
	effect(() => applyTheme(theme.value));

	const { startCastController } = await import('./cast/castController');
	startCastController();

	initFocus();
	setKeyInterceptor(overlayKeyInterceptor);

	const root = document.getElementById('app');
	if (root !== null) render(<App />, root);
}

void boot();
