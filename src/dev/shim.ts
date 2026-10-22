/**
 * Desktop-Chrome dev shim: a minimal `window.cast` stub backed by a plain <video> element so
 * the whole overlay UI can be exercised without a Chromecast. Loaded ONLY via
 * `import.meta.env.DEV && location.search.includes('shim')` (see main.tsx).
 *
 * Includes a small debug panel with a canned LOAD fixture matching the wire contract
 * (double-encoded customData, subtitle MediaTracks + activeTrackIds, descending episodes).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

type AnyFn = (...args: any[]) => any;

// ---------------------------------------------------------------------------
// <video> surface
// ---------------------------------------------------------------------------

// Reuse the page's tagged MediaElement (same one CAF would use) so the shim exercises the
// real DOM layout; create one only if the page lacks it.
const video =
	document.querySelector<HTMLVideoElement>('video.castMediaElement') ??
	(() => {
		const created = document.createElement('video');
		created.className = 'castMediaElement';
		created.style.cssText =
			'position:fixed;inset:0;width:100%;height:100%;object-fit:contain;background:#000;z-index:0;';
		document.body.appendChild(created);
		return created;
	})();

// ---------------------------------------------------------------------------
// Enums (values only need to be internally consistent)
// ---------------------------------------------------------------------------

const MessageType = { LOAD: 'LOAD', EDIT_TRACKS_INFO: 'EDIT_TRACKS_INFO' };
const PlayerState = { IDLE: 'IDLE', PLAYING: 'PLAYING', PAUSED: 'PAUSED', BUFFERING: 'BUFFERING' };
const StreamType = { BUFFERED: 'BUFFERED', LIVE: 'LIVE', NONE: 'NONE' };
const TrackType = { TEXT: 'TEXT', AUDIO: 'AUDIO', VIDEO: 'VIDEO' };
const SystemEventType = {
	READY: 'ready',
	ERROR: 'error',
	SENDER_CONNECTED: 'senderconnected',
	SENDER_DISCONNECTED: 'senderdisconnected',
};
const EventsEventType = {
	PLAYER_LOAD_COMPLETE: 'PLAYER_LOAD_COMPLETE',
	PLAYING: 'PLAYING',
	PAUSE: 'PAUSE',
	BUFFERING: 'BUFFERING',
	ENDED: 'ENDED',
	ERROR: 'ERROR',
};
const SystemMessageType = { JSON: 'JSON', STRING: 'STRING' };

// ---------------------------------------------------------------------------
// PlayerManager stub
// ---------------------------------------------------------------------------

class ShimPlayerManager {
	private interceptors = new Map<string, AnyFn>();
	private listeners = new Map<string, Set<AnyFn>>();
	private buffering = false;

	constructor() {
		video.addEventListener('loadedmetadata', () =>
			this.dispatch(EventsEventType.PLAYER_LOAD_COMPLETE, {}),
		);
		video.addEventListener('playing', () => {
			this.buffering = false;
			this.dispatch(EventsEventType.BUFFERING, { isBuffering: false });
			this.dispatch(EventsEventType.PLAYING, {});
		});
		video.addEventListener('pause', () =>
			this.dispatch(EventsEventType.PAUSE, { ended: video.ended }),
		);
		video.addEventListener('waiting', () => {
			this.buffering = true;
			this.dispatch(EventsEventType.BUFFERING, { isBuffering: true });
		});
		video.addEventListener('ended', () => this.dispatch(EventsEventType.ENDED, {}));
		video.addEventListener('error', () => this.dispatch(EventsEventType.ERROR, {}));
	}

	setMessageInterceptor(type: string, fn: AnyFn): void {
		this.interceptors.set(type, fn);
	}

	/** Per-load Shaka tuning: the shim's plain <video> has no Shaka to tune. */
	setMediaPlaybackInfoHandler(_handler: AnyFn): void {}

	/** The shim always plays into the page's own video element. */
	setMediaElement(_element: HTMLMediaElement): void {}

	getInterceptor(type: string): AnyFn | undefined {
		return this.interceptors.get(type);
	}

	addEventListener(type: string, fn: AnyFn): void {
		let set = this.listeners.get(type);
		if (!set) {
			set = new Set();
			this.listeners.set(type, set);
		}
		set.add(fn);
	}

	removeEventListener(type: string, fn: AnyFn): void {
		this.listeners.get(type)?.delete(fn);
	}

	dispatch(type: string, event: Record<string, unknown>): void {
		this.listeners.get(type)?.forEach((fn) => fn({ type, ...event }));
	}

	getCurrentTimeSec(): number {
		return video.currentTime || 0;
	}

	getDurationSec(): number {
		return Number.isFinite(video.duration) ? video.duration : 0;
	}

	getPlayerState(): string {
		if (!video.currentSrc && !video.src) return PlayerState.IDLE;
		if (video.ended) return PlayerState.IDLE;
		if (video.paused) return PlayerState.PAUSED;
		if (this.buffering || video.readyState < 3) return PlayerState.BUFFERING;
		return PlayerState.PLAYING;
	}

	async load(request: any): Promise<void> {
		const interceptor = this.interceptors.get(MessageType.LOAD);
		const result = interceptor ? await interceptor(request) : request;
		if (!result || !result.media) return;
		const url: string = result.media.contentUrl || result.media.contentId || '';
		debugLog(`LOAD → ${url}`);
		video.src = url;
		video.currentTime = Math.max(0, Number(result.currentTime) || 0);
		if (result.autoplay !== false) void video.play().catch(() => undefined);
	}

	play(): void {
		void video.play().catch(() => undefined);
	}

	pause(): void {
		video.pause();
	}

	seek(timeSec: number): void {
		video.currentTime = Math.max(0, timeSec);
	}

	stop(): void {
		video.pause();
		video.removeAttribute('src');
		video.load();
	}

	getAudioTracksManager(): { getTracks: () => any[]; setActiveById: (id: number) => void } {
		return {
			getTracks: () => [],
			setActiveById: (id: number) => debugLog(`audio setActiveById(${id})`),
		};
	}
}

// ---------------------------------------------------------------------------
// CastReceiverContext stub
// ---------------------------------------------------------------------------

class ShimCastReceiverContext {
	private pm = new ShimPlayerManager();
	private messageListeners = new Map<string, Set<AnyFn>>();
	private eventListeners = new Map<string, Set<AnyFn>>();
	private senders: Array<{ id: string }> = [];

	getPlayerManager(): ShimPlayerManager {
		return this.pm;
	}

	addCustomMessageListener(namespace: string, fn: AnyFn): void {
		let set = this.messageListeners.get(namespace);
		if (!set) {
			set = new Set();
			this.messageListeners.set(namespace, set);
		}
		set.add(fn);
	}

	sendCustomMessage(namespace: string, _senderId: string | undefined, message: unknown): void {
		debugLog(`→ ${namespace.split('.').pop()}: ${JSON.stringify(message)}`);
		const request = message as { type?: string };
		if (namespace === CONTROL_NAMESPACE && request.type === 'previewRequest') {
			fakePhonePreview(message as ShimPreviewRequest);
		}
		if (namespace === CONTROL_NAMESPACE && request.type === 'previewSource') {
			fakePhonePrefetch(message as ShimPreviewSource);
		}
	}

	addEventListener(type: string, fn: AnyFn): void {
		let set = this.eventListeners.get(type);
		if (!set) {
			set = new Set();
			this.eventListeners.set(type, set);
		}
		set.add(fn);
	}

	getSenders(): Array<{ id: string }> {
		return this.senders;
	}

	start(_options?: unknown): this {
		debugLog('context.start()');
		return this;
	}

	// --- shim-only helpers -------------------------------------------------

	shimEmitSystemEvent(type: string, event: Record<string, unknown>): void {
		this.eventListeners.get(type)?.forEach((fn) => fn({ type, ...event }));
	}

	shimEmitMessage(namespace: string, data: unknown): void {
		this.messageListeners.get(namespace)?.forEach((fn) =>
			fn({ data, senderId: 'shim-sender' }),
		);
	}

	shimConnectSender(): void {
		if (this.senders.length === 0) this.senders.push({ id: 'shim-sender' });
		this.shimEmitSystemEvent(SystemEventType.SENDER_CONNECTED, { senderId: 'shim-sender' });
	}

	shimDisconnectSender(): void {
		this.senders = [];
		this.shimEmitSystemEvent(SystemEventType.SENDER_DISCONNECTED, { senderId: 'shim-sender' });
	}
}

const shimContext = new ShimCastReceiverContext();

class LoadRequestData {
	media: any;
	currentTime = 0;
	autoplay: boolean | undefined = true;
	activeTrackIds: number[] | undefined;
}
class MediaInformation {
	contentId = '';
	contentUrl: string | undefined;
	streamType: string | undefined;
	metadata: any;
	customData: unknown;
	tracks: any[] | undefined;
	textTrackStyle: unknown;
}
class GenericMediaMetadata {
	title = '';
	subtitle = '';
}
class CastReceiverOptions {
	customNamespaces: Record<string, string> = {};
	playbackConfig: PlaybackConfig | undefined;
}

/** Request-handler carrier; the shim's plain <video> ignores them (raw URLs play directly). */
class PlaybackConfig {
	manifestRequestHandler: ((requestInfo: { url: string }) => void) | undefined;
	segmentRequestHandler: ((requestInfo: { url: string }) => void) | undefined;
	licenseRequestHandler: ((requestInfo: { url: string }) => void) | undefined;
}

(window as any).cast = {
	framework: {
		CastReceiverContext: { getInstance: () => shimContext },
		CastReceiverOptions,
		PlaybackConfig,
		messages: { MessageType, PlayerState, StreamType, TrackType, LoadRequestData, MediaInformation, GenericMediaMetadata },
		events: { EventType: EventsEventType },
		system: { EventType: SystemEventType, MessageType: SystemMessageType },
	},
};

// ---------------------------------------------------------------------------
// Fake phone seekbar preview: answers `previewRequest`s with drawn frames
// ---------------------------------------------------------------------------

const CONTROL_NAMESPACE = 'urn:x-cast:com.sf.tadami.control';

interface ShimPreviewRequest {
	requestId: number;
	sourceId: string;
	step: number;
	duration: number;
}

interface ShimPreviewSource {
	sourceId: string;
	duration: number;
	steps: number[];
}

/** frames: ~0.6 s per frame; slow: ~3 s; none: every step frameless; off: no preview for the source. */
const PREVIEW_MODES = ['frames', 'slow', 'none', 'off'] as const;
let previewMode: (typeof PREVIEW_MODES)[number] = 'frames';

/** A 256x144 JPEG (base64) standing in for a decoded frame: the step and its time on a colored ground. */
function drawFakeFrame(step: number, positionMs: number): string {
	const canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 144;
	const g = canvas.getContext('2d');
	if (g === null) return '';
	const hue = (step * 37) % 360;
	const gradient = g.createLinearGradient(0, 0, 256, 144);
	gradient.addColorStop(0, `hsl(${hue}, 60%, 35%)`);
	gradient.addColorStop(1, `hsl(${(hue + 60) % 360}, 60%, 15%)`);
	g.fillStyle = gradient;
	g.fillRect(0, 0, 256, 144);
	g.fillStyle = 'rgba(255,255,255,0.9)';
	g.font = 'bold 34px sans-serif';
	g.textAlign = 'center';
	g.fillText(`Step ${step}`, 128, 70);
	const total = Math.floor(positionMs / 1000);
	g.font = '20px monospace';
	g.fillText(`${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`, 128, 104);
	return canvas.toDataURL('image/jpeg', 0.8).split(',')[1] ?? '';
}

function fakePhonePreview(request: ShimPreviewRequest): void {
	const delay = previewMode === 'slow' ? 3000 : previewMode === 'frames' ? 600 : 300;
	setTimeout(() => {
		const stepMs = Math.min(30_000, Math.max(5_000, Math.floor(request.duration / 100)));
		const reply: Record<string, unknown> = {
			type: 'previewFrame',
			requestId: request.requestId,
			sourceId: request.sourceId,
			step: request.step,
			status: previewMode === 'none' ? 'none' : previewMode === 'off' ? 'off' : 'ok',
		};
		if (reply['status'] === 'ok') {
			reply['jpeg'] = drawFakeFrame(request.step, request.step * stepMs + stepMs / 2);
			reply['width'] = 256;
			reply['height'] = 144;
		}
		debugLog(`fake phone: step ${request.step} ${String(reply['status'])} ${String(reply['jpeg'] ?? '').length}B`);
		shimContext.shimEmitMessage(CONTROL_NAMESPACE, reply);
	}, delay);
}

let prefetchTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * The phone's background prefetch: every step pushed unsolicited (no requestId), nearest the
 * playback position first, one every 150 ms (1 s in "slow"); none in "off".
 */
function fakePhonePrefetch(source: ShimPreviewSource): void {
	if (prefetchTimer !== null) clearTimeout(prefetchTimer);
	if (previewMode === 'off') return;
	const stepMs = Math.min(30_000, Math.max(5_000, Math.floor(source.duration / 100)));
	const last = Math.floor(Math.max(0, source.duration - 1) / stepMs);
	const center = Math.min(last, Math.floor((video.currentTime * 1000) / stepMs));
	const order: number[] = [center];
	for (let d = 1; order.length <= last; d++) {
		if (center + d <= last) order.push(center + d);
		if (center - d >= 0) order.push(center - d);
	}
	const pending = order.filter((step) => !source.steps.includes(step));
	debugLog(`fake phone: prefetching ${pending.length} of ${last + 1} steps from step ${center}`);
	const pushNext = () => {
		const step = pending.shift();
		if (step === undefined) return;
		const reply: Record<string, unknown> = { type: 'previewFrame', sourceId: source.sourceId, step, status: previewMode === 'none' ? 'none' : 'ok' };
		if (reply['status'] === 'ok') reply['jpeg'] = drawFakeFrame(step, step * stepMs + stepMs / 2);
		shimContext.shimEmitMessage(CONTROL_NAMESPACE, reply);
		prefetchTimer = setTimeout(pushNext, previewMode === 'slow' ? 1000 : 150);
	};
	prefetchTimer = setTimeout(pushNext, 1000);
}

// ---------------------------------------------------------------------------
// Canned LOAD fixture (realistic wire shape: double-encoded customData)
// ---------------------------------------------------------------------------

const argb = (v: number): number => v | 0; // Android ships signed 32-bit ints

const VTT_EN =
	'data:text/vtt,' +
	encodeURIComponent(
		'WEBVTT\n\n00:00.500 --> 00:06.000 line:-2\nShim subtitle: hello from the dev fixture!\n\n00:06.500 --> 00:12.000 line:-2\n<i>Second cue,</i> with markup stripped.\n\n00:06.500 --> 00:12.000 line:-3\nStacked row above.\n',
	);
const VTT_FR =
	'data:text/vtt,' +
	encodeURIComponent('WEBVTT\n\n00:00.500 --> 00:06.000\nSous-titre de test (français).\n');

const SOURCES = [
	{
		url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
		fullName: 'ShimServer: 1080p',
		quality: '1080p',
		server: 'ShimServer',
		headers: { Referer: 'https://shim.example/' },
		subtitleTracks: [
			{ url: 'https://upstream.example/subs/en.vtt', lang: 'English', mimeType: 'text/vtt' },
			{ url: 'https://upstream.example/subs/fr.vtt', lang: 'French', mimeType: 'text/vtt' },
		],
		audioTracks: [],
	},
	{
		url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
		fullName: 'ShimServer: 720p',
		quality: '720p',
		server: 'ShimServer',
		headers: null,
		subtitleTracks: [
			{ url: 'https://upstream.example/subs/fr.vtt', lang: 'French', mimeType: 'text/vtt' },
			{ url: 'https://upstream.example/subs/en.vtt', lang: 'English', mimeType: 'text/vtt' },
		],
		audioTracks: [],
	},
];

function buildFixtureLoad(): any {
	const request = new LoadRequestData();
	const media = new MediaInformation();
	media.contentId = SOURCES[0].url;
	media.contentUrl = SOURCES[0].url;
	media.streamType = StreamType.BUFFERED;
	media.metadata = { title: 'Shim no Anime', subtitle: 'Episode 2' };
	media.customData = {
		minReceiverProtocol: 2,
		senderProtocol: 3,
		userAgent: 'Mozilla/5.0 (shim)',
		animeId: 42,
		episodeId: 2,
		seen: false,
		episodeUrl: '/anime/42/episode/2',
		availableSources: JSON.stringify(SOURCES),
		selectedSource: JSON.stringify(SOURCES[0]),
		episodes: JSON.stringify([
			{ id: 3, name: 'The Third One', episodeNumber: 3, seen: false },
			{ id: 2, name: 'The Second One', episodeNumber: 2, seen: false },
			{ id: 1, name: 'The First One', episodeNumber: 1, seen: true },
		]),
		displayMode: 'NUMBER',
		theme: JSON.stringify({
			primary: argb(0xffb0c6ff),
			onPrimary: argb(0xff002d6e),
			secondary: argb(0xffccc2dc),
			onSecondary: argb(0xff332d41),
			background: argb(0xff1b1b1f),
			onBackground: argb(0xffe3e2e6),
			surface: argb(0xff1b1b1f),
			onSurface: argb(0xffe3e2e6),
			surfaceVariant: argb(0xff2a2a30),
			onSurfaceVariant: argb(0xffc6c5d0),
		}),
		subtitleStyle: JSON.stringify({
			textSize: 22,
			fontWeight: 700,
			outlineWidth: 22,
			letterSpacing: 0,
			textColor: 0,
			edgeColor: 0,
			italic: false,
		}),
		// No proxyBaseUrl in the shim: raw URLs play directly in desktop Chrome.
		// The fake phone below answers the seekbar preview requests.
		seekPreview: true,
	};
	media.tracks = [
		{ trackId: 1, type: TrackType.TEXT, trackContentId: VTT_EN, trackContentType: 'text/vtt', language: 'en', name: 'English' },
		{ trackId: 2, type: TrackType.TEXT, trackContentId: VTT_FR, trackContentType: 'text/vtt', language: 'fr', name: 'French' },
	];
	request.activeTrackIds = [1];
	request.media = media;
	request.currentTime = 0;
	request.autoplay = true;
	return request;
}

// ---------------------------------------------------------------------------
// Debug panel
// ---------------------------------------------------------------------------

let logEl: HTMLElement | null = null;

function debugLog(line: string): void {
	// eslint-disable-next-line no-console
	console.info(`[shim] ${line}`);
	if (logEl) {
		logEl.textContent = `${line}\n${logEl.textContent ?? ''}`.split('\n').slice(0, 12).join('\n');
	}
}

function buildPanel(): void {
	const panel = document.createElement('div');
	panel.style.cssText =
		'position:fixed;right:8px;bottom:8px;z-index:1000;background:rgba(0,0,0,.75);color:#9f9;' +
		'font:11px/1.4 monospace;padding:8px;border-radius:6px;max-width:340px;cursor:auto;';
	const row = document.createElement('div');
	row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;';

	const button = (label: string, onClick: () => void): HTMLButtonElement => {
		const b = document.createElement('button');
		b.textContent = label;
		b.style.cssText = 'font:11px monospace;padding:2px 6px;cursor:pointer;';
		b.addEventListener('click', onClick);
		row.appendChild(b);
		return b;
	};

	button('connect', () => shimContext.shimConnectSender());
	button('handshake', () =>
		shimContext.shimEmitMessage('urn:x-cast:com.sf.tadami.handshake', {
			senderProtocol: 3,
			minReceiverProtocol: 2,
		}),
	);
	button('LOAD fixture', () => void shimContext.getPlayerManager().load(buildFixtureLoad()));
	button('style big/yellow', () =>
		shimContext.shimEmitMessage('urn:x-cast:com.sf.tadami.control', {
			type: 'subtitleStyle',
			subtitleStyle: {
				textSize: 32,
				fontWeight: 700,
				outlineWidth: 22,
				letterSpacing: 0,
				textColor: argb(0xffffee58),
				edgeColor: 0,
				italic: false,
			},
		}),
	);
	button('disconnect', () => shimContext.shimDisconnectSender());
	const previewButton = button(`preview: ${previewMode}`, () => {
		previewMode = PREVIEW_MODES[(PREVIEW_MODES.indexOf(previewMode) + 1) % PREVIEW_MODES.length];
		previewButton.textContent = `preview: ${previewMode}`;
		debugLog(`fake phone preview mode: ${previewMode} (applies from the next request; LOAD again to reset)`);
	});

	panel.appendChild(row);
	logEl = document.createElement('pre');
	logEl.style.cssText = 'white-space:pre-wrap;max-height:120px;overflow:hidden;margin:0;';
	panel.appendChild(logEl);
	document.body.appendChild(panel);
}

buildPanel();
debugLog('cast shim installed — press "connect", then "LOAD fixture"');
