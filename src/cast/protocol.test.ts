import { describe, expect, it } from 'vitest';
import {
	argbToCss,
	argbWithAlphaToCss,
	episodeLabel,
	findEpisodeIndex,
	hasNextEpisode,
	hasPreviousEpisode,
	parseControlMessage,
	parseCustomData,
	parseSenderHandshake,
	sourceLabel,
	type TvEpisode,
} from './protocol';

/** A realistic LOAD customData payload, matching CastLoad.kt's double-encoded shape. */
function realisticCustomData(): Record<string, unknown> {
	return {
		minReceiverProtocol: 2,
		senderProtocol: 2,
		userAgent: 'Mozilla/5.0 (phone)',
		animeId: 42,
		episodeId: 7,
		seen: false,
		episodeUrl: '/anime/42/episode/7',
		availableSources: JSON.stringify([
			{
				url: 'https://host.example/ep7-1080.m3u8',
				fullName: 'Server A: 1080p',
				quality: '1080p',
				server: 'Server A',
				headers: { Referer: 'https://host.example/' },
				subtitleTracks: [{ url: 'https://host.example/en.vtt', lang: 'English', mimeType: 'text/vtt' }],
				audioTracks: [{ url: 'https://host.example/jp.m3u8', lang: 'Japanese' }],
			},
			{
				url: 'https://other.example/ep7.mp4',
				fullName: '',
				quality: '720p',
				server: 'Server B',
				subtitleTracks: [],
				audioTracks: [],
			},
		]),
		selectedSource: JSON.stringify({
			url: 'https://other.example/ep7.mp4',
			fullName: '',
			quality: '720p',
			server: 'Server B',
			subtitleTracks: [],
			audioTracks: [],
		}),
		episodes: JSON.stringify([
			{ id: 8, name: 'Ep 8', episodeNumber: 8, seen: false },
			{ id: 7, name: 'Ep 7', episodeNumber: 7, seen: false },
			{ id: 6, name: 'Ep 6', episodeNumber: 6, seen: true },
		]),
		displayMode: 'NAME',
		theme: JSON.stringify({
			primary: -5192961,
			onPrimary: -16765586,
			secondary: -3358500,
			onSecondary: -13423295,
			background: -14994913,
			onBackground: -1842458,
			surface: -14994913,
			onSurface: -1842458,
			surfaceVariant: -14013904,
			onSurfaceVariant: -3750448,
		}),
		subtitleStyle: JSON.stringify({
			textSize: 24,
			fontWeight: 600,
			outlineWidth: 20,
			letterSpacing: 2,
			textColor: 0,
			edgeColor: -16777216,
			italic: true,
		}),
		proxyBaseUrl: 'http://192.168.1.4:8214',
	};
}

describe('parseCustomData', () => {
	it('parses the full double-encoded payload', () => {
		const cd = parseCustomData(realisticCustomData());
		expect(cd.isTadami).toBe(true);
		expect(cd.minReceiverProtocol).toBe(2);
		expect(cd.senderProtocol).toBe(2);
		expect(cd.userAgent).toBe('Mozilla/5.0 (phone)');
		expect(cd.episodeId).toBe(7);
		expect(cd.availableSources).toHaveLength(2);
		expect(cd.availableSources?.[0].headers).toEqual({ Referer: 'https://host.example/' });
		expect(cd.availableSources?.[0].subtitleTracks[0].lang).toBe('English');
		expect(cd.availableSources?.[0].audioTracks[0].url).toBe('https://host.example/jp.m3u8');
		expect(cd.selectedSource?.url).toBe('https://other.example/ep7.mp4');
		expect(cd.selectedSource?.headers).toBeNull();
		expect(cd.episodes.map((e) => e.id)).toEqual([8, 7, 6]);
		expect(cd.displayMode).toBe('NAME');
		expect(cd.theme?.primary).toBe(-5192961);
		expect(cd.subtitleStyle?.textSize).toBe(24);
		expect(cd.subtitleStyle?.italic).toBe(true);
		expect(cd.proxyBaseUrl).toBe('http://192.168.1.4:8214');
	});

	it('accepts a stringified outer customData', () => {
		const cd = parseCustomData(JSON.stringify(realisticCustomData()));
		expect(cd.isTadami).toBe(true);
		expect(cd.availableSources).toHaveLength(2);
	});

	it('survives one malformed stringified field without dropping the others', () => {
		const raw = realisticCustomData();
		raw['availableSources'] = '{not json!!';
		raw['theme'] = '[1,2,3]'; // wrong shape
		const cd = parseCustomData(raw);
		expect(cd.availableSources).toBeNull();
		expect(cd.theme).toBeNull();
		// unaffected fields still parse
		expect(cd.selectedSource?.url).toBe('https://other.example/ep7.mp4');
		expect(cd.episodes).toHaveLength(3);
		expect(cd.subtitleStyle?.fontWeight).toBe(600);
	});

	it('treats a theme with a missing color as unusable', () => {
		const cd = parseCustomData({
			senderProtocol: 2,
			theme: JSON.stringify({ primary: 1, onPrimary: 2 }),
		});
		expect(cd.theme).toBeNull();
	});

	it('flags non-Tadami loads', () => {
		const cd = parseCustomData({ something: 'else' });
		expect(cd.isTadami).toBe(false);
		expect(cd.minReceiverProtocol).toBe(1);
		expect(cd.senderProtocol).toBe(1);
	});

	it('handles null/undefined customData', () => {
		expect(parseCustomData(null).isTadami).toBe(false);
		expect(parseCustomData(undefined).isTadami).toBe(false);
		expect(parseCustomData(undefined).episodes).toEqual([]);
	});
});

describe('argb conversion', () => {
	it('converts signed 32-bit ARGB ints (Android wire form)', () => {
		// 0xFFB0C6FF (Terebi primary) as a signed int is -5191937.
		expect(0xffb0c6ff | 0).toBe(-5191937);
		expect(argbToCss(-5191937)).toBe('rgba(176, 198, 255, 1)');
		// 0xFF1B1B1F (background) as a signed int is -15000801.
		expect(0xff1b1b1f | 0).toBe(-15000801);
		expect(argbToCss(-15000801)).toBe('rgba(27, 27, 31, 1)');
	});

	it('converts positive ints and semi-transparent alphas', () => {
		expect(argbToCss(0x80000000)).toBe('rgba(0, 0, 0, 0.502)');
		expect(argbToCss(0x00ffffff)).toBe('rgba(255, 255, 255, 0)');
	});

	it('computes alpha variants', () => {
		expect(argbWithAlphaToCss(-5191937, 0.1)).toBe('rgba(176, 198, 255, 0.1)');
		expect(argbWithAlphaToCss(-15000801, 0.7)).toBe('rgba(27, 27, 31, 0.7)');
	});
});

describe('episode navigation math (descending list)', () => {
	const episodes: TvEpisode[] = [
		{ id: 30, name: '', episodeNumber: 3, seen: false },
		{ id: 20, name: '', episodeNumber: 2, seen: false },
		{ id: 10, name: '', episodeNumber: 1, seen: true },
	];

	it('finds the current index by id', () => {
		expect(findEpisodeIndex(episodes, 20)).toBe(1);
		expect(findEpisodeIndex(episodes, 99)).toBe(-1);
	});

	it('next = index-1, previous = index+1', () => {
		// middle: both available
		expect(hasNextEpisode(1)).toBe(true);
		expect(hasPreviousEpisode(1, episodes.length)).toBe(true);
		// newest (index 0): no next, has previous
		expect(hasNextEpisode(0)).toBe(false);
		expect(hasPreviousEpisode(0, episodes.length)).toBe(true);
		// oldest (last index): has next, no previous
		expect(hasNextEpisode(2)).toBe(true);
		expect(hasPreviousEpisode(2, episodes.length)).toBe(false);
		// not found
		expect(hasNextEpisode(-1)).toBe(false);
		expect(hasPreviousEpisode(-1, episodes.length)).toBe(false);
	});
});

describe('labels', () => {
	it('episodeLabel honors displayMode and integer formatting', () => {
		const ep: TvEpisode = { id: 1, name: 'The One', episodeNumber: 7, seen: false };
		expect(episodeLabel(ep, 'NAME')).toBe('The One');
		expect(episodeLabel(ep, 'NUMBER')).toBe('Episode 7');
		expect(episodeLabel({ ...ep, name: '' }, 'NAME')).toBe('Episode 7');
		expect(episodeLabel({ ...ep, episodeNumber: 7.5 }, 'NUMBER')).toBe('Episode 7.5');
	});

	it('sourceLabel falls back fullName → server+quality → url', () => {
		const base = { url: 'u', fullName: '', quality: '', server: '', headers: null, subtitleTracks: [], audioTracks: [] };
		expect(sourceLabel({ ...base, fullName: 'Full' })).toBe('Full');
		expect(sourceLabel({ ...base, server: 'S', quality: '720p' })).toBe('S 720p');
		expect(sourceLabel(base)).toBe('u');
	});
});

describe('parseSenderHandshake / parseControlMessage', () => {
	it('parses handshake with proxyBaseUrl', () => {
		const msg = parseSenderHandshake({ senderProtocol: 2, minReceiverProtocol: 2, proxyBaseUrl: 'http://10.0.0.2:8214' });
		expect(msg).toEqual({ senderProtocol: 2, minReceiverProtocol: 2, proxyBaseUrl: 'http://10.0.0.2:8214' });
	});

	it('parses handshake from a JSON string and defaults missing fields', () => {
		const msg = parseSenderHandshake('{"senderProtocol":1}');
		expect(msg?.senderProtocol).toBe(1);
		expect(msg?.minReceiverProtocol).toBe(1);
		expect(msg?.proxyBaseUrl).toBeUndefined();
	});

	it('parses control messages tolerantly', () => {
		const msg = parseControlMessage({ type: 'selectSubtitle', subtitleIndex: -1, junk: true });
		expect(msg?.type).toBe('selectSubtitle');
		expect(msg?.subtitleIndex).toBe(-1);
		expect(parseControlMessage({ noType: 1 })).toBeNull();
		expect(parseControlMessage('garbage')).toBeNull();
	});
});
