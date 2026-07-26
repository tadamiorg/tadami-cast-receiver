/**
 * Single typed wire-contract module for the Tadami cast protocol (v3).
 *
 * v3: the phone proxy is a STATELESS forwarder (`GET /proxy?url=<enc>&headers=<enc-json>`, the
 * receiver carries the source headers on every request, no phone-side registry or manifest
 * rewriting); the receiver routes media through it only for header-bound sources and fixes broken
 * relative-URI resolution itself by proxy-domain detection.
 *
 * Mirrors the phone sender (`tadami/.../cast/CastLoad.kt`, `channels/*.kt`, `CastProtocol.kt`)
 * and the native receiver's models (`tadami-terebi/.../player/CastModels.kt`). Everything in
 * here is pure (no `cast.*` globals) so it is unit-testable under vitest/node.
 *
 * The phone double-encodes most customData payloads: the outer LOAD customData is a JSON
 * object whose fields (`availableSources`, `selectedSource`, `episodes`, `theme`,
 * `subtitleStyle`) are themselves *stringified* JSON. Each field is parsed independently and
 * tolerantly — one malformed field never takes the others down.
 */

// ---------------------------------------------------------------------------
// Namespaces & protocol versions
// ---------------------------------------------------------------------------

export const CONTROL_NAMESPACE = 'urn:x-cast:com.sf.tadami.control';
export const HANDSHAKE_NAMESPACE = 'urn:x-cast:com.sf.tadami.handshake';
export const ERROR_NAMESPACE = 'urn:x-cast:com.sf.tadami.error';
export const CRASH_NAMESPACE = 'urn:x-cast:com.sf.tadami.crash';

/** Protocol version this receiver implements (mirrors Terebi's RECEIVER_VERSION). */
export const RECEIVER_PROTOCOL = 3;
/**
 * Oldest sender (phone) protocol this receiver can work with. 3: a v2 phone's proxy resolves
 * headers from a phone-side registry and rewrites m3u8 bodies — incompatible with this receiver's
 * request-carried headers; better the "update your app" notice than silent misbehavior.
 */
export const MIN_SENDER_PROTOCOL = 3;

/** packageName reported on the crash channel so the phone can tell web crashes apart. */
export const CRASH_PACKAGE_NAME = 'com.sf.tadami.cast.web';

// ---------------------------------------------------------------------------
// Error channel
// ---------------------------------------------------------------------------

export const CastErrorCode = {
	/** Generic receiver/system communication error. */
	COMMUNICATION: 666,
	/** Protocol mismatch — sender and receiver cannot talk to each other. */
	UNSUPPORTED: 104,
	/** Media failed to load/play. */
	LOAD_FAILED: 905,
} as const;

export type CastErrorCodeValue = (typeof CastErrorCode)[keyof typeof CastErrorCode];

export interface TadamiCastError {
	errorCode: number;
	/** Compact diagnostic (shaka category/code + error data — failing URL, HTTP status). */
	detail?: string;
}

// ---------------------------------------------------------------------------
// Crash channel
// ---------------------------------------------------------------------------

export interface CrashLog {
	stacktrace: string;
	packageName: string;
	versionName: string;
	timestamp: number;
}

// ---------------------------------------------------------------------------
// Handshake channel
// ---------------------------------------------------------------------------

/** Phone → receiver, pushed at connect time (and re-announced after service restarts). */
export interface SenderHandshakeMessage {
	senderProtocol: number;
	minReceiverProtocol: number;
	/** New in protocol v2: base URL of the phone-local proxy (e.g. "http://192.168.1.4:8214"). */
	proxyBaseUrl?: string;
}

/** Receiver → phone reply. Only the web receiver sends this — its absence means native. */
export interface ReceiverHandshakeMessage {
	receiverType: 'web';
	receiverProtocol: number;
	receiverVersion: string;
}

export function parseSenderHandshake(raw: unknown): SenderHandshakeMessage | null {
	const obj = asObject(raw) ?? (typeof raw === 'string' ? asObject(tryJsonParse(raw)) : null);
	if (!obj) return null;
	return {
		senderProtocol: asNumber(obj['senderProtocol'], 1),
		minReceiverProtocol: asNumber(obj['minReceiverProtocol'], 1),
		proxyBaseUrl: asOptionalString(obj['proxyBaseUrl']),
	};
}

// ---------------------------------------------------------------------------
// Control channel
// ---------------------------------------------------------------------------

/**
 * Control messages over `urn:x-cast:com.sf.tadami.control`.
 * receiver → phone: "progress" | "save" | "next" | "previous" | "selectEpisode" | "state".
 * phone → receiver: "selectSource" | "selectSubtitle" | "selectAudio" | "subtitleStyle".
 */
export interface TvControlMessage {
	type: string;
	position: number;
	duration: number;
	playing: boolean;
	episodeId?: number | null;
	/** Index into the current source's list. subtitleIndex === -1 means subtitles off. */
	sourceIndex?: number | null;
	subtitleIndex?: number | null;
	audioIndex?: number | null;
	subtitleStyle?: CastSubtitleStyle | null;
}

export function parseControlMessage(raw: unknown): TvControlMessage | null {
	const obj = asObject(raw) ?? (typeof raw === 'string' ? asObject(tryJsonParse(raw)) : null);
	if (!obj || typeof obj['type'] !== 'string') return null;
	return {
		type: obj['type'],
		position: asNumber(obj['position'], 0),
		duration: asNumber(obj['duration'], 0),
		playing: obj['playing'] === true,
		episodeId: asOptionalNumber(obj['episodeId']),
		sourceIndex: asOptionalNumber(obj['sourceIndex']),
		subtitleIndex: asOptionalNumber(obj['subtitleIndex']),
		audioIndex: asOptionalNumber(obj['audioIndex']),
		subtitleStyle: normalizeSubtitleStyle(obj['subtitleStyle']),
	};
}

// ---------------------------------------------------------------------------
// Media models (mirrors CastModels.kt)
// ---------------------------------------------------------------------------

export interface SubtitleTrack {
	url: string;
	lang: string;
	mimeType: string;
}

export interface AudioTrack {
	url: string;
	lang: string;
}

export interface StreamSource {
	url: string;
	fullName: string;
	quality: string;
	server: string;
	headers: Record<string, string> | null;
	subtitleTracks: SubtitleTrack[];
	audioTracks: AudioTrack[];
}

/** Human-readable label for the source picker (mirrors TvStreamSource.label). */
export function sourceLabel(source: StreamSource): string {
	if (source.fullName.trim() !== '') return source.fullName;
	const composite = `${source.server} ${source.quality}`.trim();
	return composite !== '' ? composite : source.url;
}

export interface TvEpisode {
	id: number;
	name: string;
	episodeNumber: number;
	seen: boolean;
}

/** Mirrors TvEpisode.label(displayMode). */
export function episodeLabel(episode: TvEpisode, displayMode: string): string {
	const n = episode.episodeNumber;
	const number = Number.isInteger(n) ? String(n) : String(n);
	if (displayMode === 'NAME' && episode.name.trim() !== '') return episode.name;
	return `Episode ${number}`;
}

/** ARGB ints of the phone's active color scheme, forwarded so the receiver mirrors it. */
export interface TvThemeColors {
	primary: number;
	onPrimary: number;
	secondary: number;
	onSecondary: number;
	background: number;
	onBackground: number;
	surface: number;
	onSurface: number;
	surfaceVariant: number;
	onSurfaceVariant: number;
}

/** Subtitle style forwarded phone→receiver (defaults mirror CastSubtitleStyle.kt). */
export interface CastSubtitleStyle {
	textSize: number;
	fontWeight: number;
	/** Outline width as a percentage of the font size (22 => 0.22 * fontSize). */
	outlineWidth: number;
	letterSpacing: number;
	/** ARGB int; 0 means "unset" (renderer falls back to white). */
	textColor: number;
	/** ARGB int; 0 means "unset" (renderer falls back to black). */
	edgeColor: number;
	italic: boolean;
}

/** Mirrors the phone's PlayerPreferences defaults so an unstyled load already looks right. */
export const DEFAULT_SUBTITLE_STYLE: CastSubtitleStyle = {
	textSize: 24,
	fontWeight: 700,
	outlineWidth: 35,
	letterSpacing: 2,
	textColor: 0,
	edgeColor: 0,
	italic: false,
};

// ---------------------------------------------------------------------------
// LOAD customData
// ---------------------------------------------------------------------------

export interface ParsedCustomData {
	/** Present when this LOAD carries the Tadami contract at all. */
	isTadami: boolean;
	minReceiverProtocol: number;
	senderProtocol: number;
	userAgent: string | null;
	animeId: number | null;
	episodeId: number;
	seen: boolean;
	episodeUrl: string | null;
	availableSources: StreamSource[] | null;
	selectedSource: StreamSource | null;
	/** DESCENDING order — "next" episode is index-1, "previous" is index+1. */
	episodes: TvEpisode[];
	displayMode: string;
	theme: TvThemeColors | null;
	subtitleStyle: CastSubtitleStyle | null;
	proxyBaseUrl: string | null;
}

/**
 * Tolerant parse of the LOAD customData. Every stringified field is individually
 * try/catch'd so one malformed payload never breaks the rest of the load.
 */
export function parseCustomData(raw: unknown): ParsedCustomData {
	const obj = asObject(raw) ?? (typeof raw === 'string' ? asObject(tryJsonParse(raw)) : null) ?? {};
	const availableSources = parseStringifiedField(obj['availableSources'], normalizeStreamSourceList);
	const selectedSource = parseStringifiedField(obj['selectedSource'], normalizeStreamSource);
	return {
		isTadami:
			obj['selectedSource'] !== undefined ||
			obj['availableSources'] !== undefined ||
			obj['senderProtocol'] !== undefined ||
			obj['minReceiverProtocol'] !== undefined,
		minReceiverProtocol: asNumber(obj['minReceiverProtocol'], 1),
		senderProtocol: asNumber(obj['senderProtocol'], 1),
		userAgent: asOptionalString(obj['userAgent']) ?? null,
		animeId: asOptionalNumber(obj['animeId']),
		episodeId: asNumber(obj['episodeId'], 0),
		seen: obj['seen'] === true,
		episodeUrl: asOptionalString(obj['episodeUrl']) ?? null,
		availableSources,
		selectedSource,
		episodes: parseStringifiedField(obj['episodes'], normalizeEpisodeList) ?? [],
		displayMode: asOptionalString(obj['displayMode']) ?? 'NUMBER',
		theme: parseStringifiedField(obj['theme'], normalizeThemeColors),
		subtitleStyle: parseStringifiedField(obj['subtitleStyle'], normalizeSubtitleStyle),
		proxyBaseUrl: asOptionalString(obj['proxyBaseUrl']) ?? null,
	};
}

/**
 * Parses one double-encoded customData field: accepts a JSON string (the normal wire form)
 * or an already-decoded value; returns null on any failure instead of throwing.
 */
export function parseStringifiedField<T>(
	value: unknown,
	normalize: (decoded: unknown) => T | null,
): T | null {
	if (value === undefined || value === null) return null;
	try {
		const decoded = typeof value === 'string' ? (value.trim() === '' ? null : JSON.parse(value)) : value;
		if (decoded === null || decoded === undefined) return null;
		return normalize(decoded);
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Model normalizers (each returns null when the shape is unusable)
// ---------------------------------------------------------------------------

export function normalizeStreamSource(raw: unknown): StreamSource | null {
	const obj = asObject(raw);
	if (!obj) return null;
	return {
		url: asString(obj['url'], ''),
		fullName: asString(obj['fullName'], ''),
		quality: asString(obj['quality'], ''),
		server: asString(obj['server'], ''),
		headers: normalizeHeaders(obj['headers']),
		subtitleTracks: normalizeList(obj['subtitleTracks'], normalizeSubtitleTrack),
		audioTracks: normalizeList(obj['audioTracks'], normalizeAudioTrack),
	};
}

export function normalizeStreamSourceList(raw: unknown): StreamSource[] | null {
	if (!Array.isArray(raw)) return null;
	const sources = raw.map(normalizeStreamSource).filter((s): s is StreamSource => s !== null);
	return sources;
}

function normalizeSubtitleTrack(raw: unknown): SubtitleTrack | null {
	const obj = asObject(raw);
	if (!obj) return null;
	return {
		url: asString(obj['url'], ''),
		lang: asString(obj['lang'], ''),
		mimeType: asString(obj['mimeType'], 'text/x-unknown'),
	};
}

function normalizeAudioTrack(raw: unknown): AudioTrack | null {
	const obj = asObject(raw);
	if (!obj) return null;
	return {
		url: asString(obj['url'], ''),
		lang: asString(obj['lang'], ''),
	};
}

function normalizeHeaders(raw: unknown): Record<string, string> | null {
	const obj = asObject(raw);
	if (!obj) return null;
	const headers: Record<string, string> = {};
	for (const [key, value] of Object.entries(obj)) {
		if (typeof value === 'string') headers[key] = value;
	}
	return headers;
}

export function normalizeEpisode(raw: unknown): TvEpisode | null {
	const obj = asObject(raw);
	if (!obj) return null;
	return {
		id: asNumber(obj['id'], 0),
		name: asString(obj['name'], ''),
		episodeNumber: asNumber(obj['episodeNumber'], 0),
		seen: obj['seen'] === true,
	};
}

export function normalizeEpisodeList(raw: unknown): TvEpisode[] | null {
	if (!Array.isArray(raw)) return null;
	return raw.map(normalizeEpisode).filter((e): e is TvEpisode => e !== null);
}

export function normalizeThemeColors(raw: unknown): TvThemeColors | null {
	const obj = asObject(raw);
	if (!obj) return null;
	const keys = [
		'primary',
		'onPrimary',
		'secondary',
		'onSecondary',
		'background',
		'onBackground',
		'surface',
		'onSurface',
		'surfaceVariant',
		'onSurfaceVariant',
	] as const;
	const theme = {} as Record<(typeof keys)[number], number>;
	for (const key of keys) {
		const value = obj[key];
		if (typeof value !== 'number' || !Number.isFinite(value)) return null;
		theme[key] = value;
	}
	return theme;
}

export function normalizeSubtitleStyle(raw: unknown): CastSubtitleStyle | null {
	const obj = asObject(raw);
	if (!obj) return null;
	return {
		textSize: asNumber(obj['textSize'], DEFAULT_SUBTITLE_STYLE.textSize),
		fontWeight: asNumber(obj['fontWeight'], DEFAULT_SUBTITLE_STYLE.fontWeight),
		outlineWidth: asNumber(obj['outlineWidth'], DEFAULT_SUBTITLE_STYLE.outlineWidth),
		letterSpacing: asNumber(obj['letterSpacing'], DEFAULT_SUBTITLE_STYLE.letterSpacing),
		textColor: asNumber(obj['textColor'], DEFAULT_SUBTITLE_STYLE.textColor),
		edgeColor: asNumber(obj['edgeColor'], DEFAULT_SUBTITLE_STYLE.edgeColor),
		italic: obj['italic'] === true,
	};
}

// ---------------------------------------------------------------------------
// ARGB → CSS
// ---------------------------------------------------------------------------

export interface Rgba {
	r: number;
	g: number;
	b: number;
	/** 0..1 */
	a: number;
}

/** Android ships colors as *signed* 32-bit ARGB ints (0xFFB0C6FF arrives as -5192961-ish). */
export function argbToRgba(argb: number): Rgba {
	const v = argb >>> 0; // reinterpret as unsigned 32-bit
	return {
		a: ((v >>> 24) & 0xff) / 255,
		r: (v >>> 16) & 0xff,
		g: (v >>> 8) & 0xff,
		b: v & 0xff,
	};
}

export function argbToCss(argb: number): string {
	const { r, g, b, a } = argbToRgba(argb);
	return rgbaCss(r, g, b, a);
}

/** CSS color for an ARGB int with its alpha replaced (used for the theme's alpha variants). */
export function argbWithAlphaToCss(argb: number, alpha: number): string {
	const { r, g, b } = argbToRgba(argb);
	return rgbaCss(r, g, b, alpha);
}

function rgbaCss(r: number, g: number, b: number, a: number): string {
	const alpha = Math.round(a * 1000) / 1000;
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---------------------------------------------------------------------------
// Episode navigation math (episodes list arrives in DESCENDING order)
// ---------------------------------------------------------------------------

export function findEpisodeIndex(episodes: TvEpisode[], episodeId: number): number {
	return episodes.findIndex((e) => e.id === episodeId);
}

/** "next" = the entry BEFORE the current one (descending list). */
export function hasNextEpisode(index: number): boolean {
	return index > 0;
}

/** "previous" = the entry AFTER the current one. */
export function hasPreviousEpisode(index: number, count: number): boolean {
	return index >= 0 && index < count - 1;
}

// ---------------------------------------------------------------------------
// Small tolerant coercion helpers
// ---------------------------------------------------------------------------

function tryJsonParse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

function asObject(value: unknown): Record<string, unknown> | null {
	if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return null;
}

function asString(value: unknown, fallback: string): string {
	return typeof value === 'string' ? value : fallback;
}

function asOptionalString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function asNumber(value: unknown, fallback: number): number {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const parsed = Number(value);
		if (Number.isFinite(parsed) && value.trim() !== '') return parsed;
	}
	return fallback;
}

function asOptionalNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	return null;
}

function normalizeList<T>(raw: unknown, normalize: (v: unknown) => T | null): T[] {
	if (!Array.isArray(raw)) return [];
	return raw.map(normalize).filter((v): v is T => v !== null);
}
