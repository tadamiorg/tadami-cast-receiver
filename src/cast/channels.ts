/**
 * Custom-channel plumbing:
 *  - handshake: replies `{receiverType:"web", receiverProtocol, receiverVersion}` on
 *    SENDER_CONNECTED and on every handshake message (the reply is how the phone detects a
 *    web receiver); records `proxyBaseUrl` re-announced after phone service restarts.
 *  - control: outbound progress/save/next/previous/selectEpisode/state/previewRequest, inbound
 *    selectSource/selectSubtitle/selectAudio/subtitleStyle/previewFrame.
 */

import type { CastReceiverContext } from 'chromecast-caf-receiver/cast.framework';
import type {
	Message as SystemMessage,
	SenderConnectedEvent,
} from 'chromecast-caf-receiver/cast.framework.system';
import * as store from '../player/store';
import { selectAudio, selectSubtitle, switchSource } from '../player/tracks';
import { debugLog } from './debug';
import { flushPendingCrash } from './crashReporter';
import { announcePreviewSource, handlePreviewFrame, initSeekPreview } from '../preview/seekPreview';
import {
	CONTROL_NAMESPACE,
	HANDSHAKE_NAMESPACE,
	RECEIVER_CAPABILITIES,
	RECEIVER_PROTOCOL,
	parseControlMessage,
	parsePreviewFrame,
	parseSenderHandshake,
	type PreviewRequestMessage,
	type PreviewSourceMessage,
	type ReceiverHandshakeMessage,
	type TvControlMessage,
} from './protocol';

declare const __RECEIVER_VERSION__: string;

/** Push watch-time to the phone every 5 s while a duration is known and nothing loads. */
const PROGRESS_INTERVAL_S = 5;

function context(): CastReceiverContext {
	return cast.framework.CastReceiverContext.getInstance();
}

// ---------------------------------------------------------------------------
// Handshake
// ---------------------------------------------------------------------------

export function sendHandshakeReply(senderId?: string): void {
	const reply: ReceiverHandshakeMessage = {
		receiverType: 'web',
		receiverProtocol: RECEIVER_PROTOCOL,
		receiverVersion: __RECEIVER_VERSION__,
		capabilities: RECEIVER_CAPABILITIES,
	};
	try {
		context().sendCustomMessage(HANDSHAKE_NAMESPACE, senderId, reply);
	} catch {
		// Not connected yet — the SENDER_CONNECTED reply will cover it.
	}
}

function onHandshakeMessage(event: SystemMessage): void {
	const message = parseSenderHandshake(event.data);
	// The handshake also carries the proxy base URL (covers phone service restarts
	// that rebind to a fresh port after the initial LOAD).
	if (message?.proxyBaseUrl !== undefined) {
		store.proxyBaseUrl.value = message.proxyBaseUrl;
	}
	sendHandshakeReply(event.senderId);
	// A phone (re)binding — e.g. its cast service restarted without its frames: tell it the stream again
	announcePreviewSource(true);
}

// ---------------------------------------------------------------------------
// Control channel — outbound (mirror of Terebi's ControlSender)
// ---------------------------------------------------------------------------

function send(message: TvControlMessage | PreviewRequestMessage | PreviewSourceMessage): void {
	try {
		context().sendCustomMessage(CONTROL_NAMESPACE, undefined, message);
	} catch {
		// No connected sender.
	}
}

function base(type: string, positionMs: number, durationMs: number, playing = false): TvControlMessage {
	return { type, position: Math.round(positionMs), duration: Math.round(durationMs), playing };
}

export function sendProgress(positionMs: number, durationMs: number, playing: boolean): void {
	send(base('progress', positionMs, durationMs, playing));
}

export function sendSave(positionMs: number, durationMs: number): void {
	send(base('save', positionMs, durationMs));
}

export function sendNext(positionMs: number, durationMs: number): void {
	send(base('next', positionMs, durationMs));
}

export function sendPrevious(positionMs: number, durationMs: number): void {
	send(base('previous', positionMs, durationMs));
}

export function sendSelectEpisode(episodeId: number, positionMs: number, durationMs: number): void {
	send({ ...base('selectEpisode', positionMs, durationMs), episodeId });
}

/** Current source/subtitle/audio selection after any local change (subtitle -1 = off). */
export function sendState(sourceIndex: number, subtitleIndex: number | null, audioIndex: number): void {
	send({
		...base('state', 0, 0),
		sourceIndex,
		subtitleIndex: subtitleIndex ?? -1,
		audioIndex,
	});
}

// ---------------------------------------------------------------------------
// Control channel — inbound (phone → receiver)
// ---------------------------------------------------------------------------

function onControlMessage(event: SystemMessage): void {
	// Seekbar preview frames have their own shape (and a large base64 payload): handled apart.
	const frame = parsePreviewFrame(event.data);
	if (frame !== null) {
		debugLog(`control previewFrame step=${frame.step} ${frame.status} ${frame.jpeg?.length ?? 0}B`);
		handlePreviewFrame(frame);
		return;
	}
	const message = parseControlMessage(event.data);
	if (message === null) return;
	debugLog(
		`control ${message.type}` +
			(message.sourceIndex != null ? ` source=${message.sourceIndex}` : '') +
			(message.subtitleIndex != null ? ` subtitle=${message.subtitleIndex}` : '') +
			(message.audioIndex != null ? ` audio=${message.audioIndex}` : '') +
			(message.episodeId != null ? ` episode=${message.episodeId}` : ''),
	);
	switch (message.type) {
		case 'selectSource':
			if (typeof message.sourceIndex === 'number') switchSource(message.sourceIndex);
			break;
		case 'selectSubtitle': {
			const index = message.subtitleIndex;
			selectSubtitle(typeof index === 'number' && index >= 0 ? index : null);
			break;
		}
		case 'selectAudio':
			if (typeof message.audioIndex === 'number') selectAudio(message.audioIndex);
			break;
		case 'subtitleStyle':
			if (message.subtitleStyle != null) store.subtitleStyle.value = message.subtitleStyle;
			break;
		default:
			break;
	}
}

// ---------------------------------------------------------------------------
// Progress ticker (mirrors Terebi's PlaybackActivity media-status ticker)
// ---------------------------------------------------------------------------

let progressTimer: ReturnType<typeof setInterval> | null = null;

function startProgressTicker(): void {
	if (progressTimer !== null) clearInterval(progressTimer);
	let secondsSinceProgress = 0;
	let wasPlaying = false;
	progressTimer = setInterval(() => {
		const duration = store.durationMs.value;
		const playing = store.isPlaying.value;
		// Skip while a source/episode switch loads (stale position would misattribute).
		if (duration > 0 && !store.loading.value) {
			const position = store.positionMs.value;
			secondsSinceProgress++;
			if (secondsSinceProgress >= PROGRESS_INTERVAL_S) {
				sendProgress(position, duration, playing);
				secondsSinceProgress = 0;
			}
			// Persist immediately on pause.
			if (wasPlaying && !playing) {
				sendSave(position, duration);
			}
		}
		wasPlaying = playing;
	}, 1_000);
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

/** Registers listeners; call BEFORE context.start() (namespaces declared in the options). */
export function initChannels(): void {
	const ctx = context();

	ctx.addCustomMessageListener(HANDSHAKE_NAMESPACE, onHandshakeMessage);
	ctx.addCustomMessageListener(CONTROL_NAMESPACE, onControlMessage);
	initSeekPreview((message) => {
		debugLog(
			message.type === 'previewRequest'
				? `control previewRequest #${message.requestId} step=${message.step}`
				: `control previewSource ${message.duration}ms has=${message.steps.length}`,
		);
		send(message);
	});

	ctx.addEventListener(cast.framework.system.EventType.SENDER_CONNECTED, (event) => {
		sendHandshakeReply((event as SenderConnectedEvent).senderId);
		// A sender is connected — flush any crash saved before the last restart.
		flushPendingCrash();
	});

	startProgressTicker();
}
