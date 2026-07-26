/** Inline SVG icons — Material Symbols/Icons path data, 24x24 viewBox, fill = currentColor. */

import type { JSX } from 'preact';

interface IconProps {
	size?: number;
	class?: string;
}

function Icon({ size = 24, class: cls, children }: IconProps & { children: JSX.Element | JSX.Element[] }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="currentColor"
			aria-hidden="true"
			class={cls}
		>
			{children}
		</svg>
	);
}

export function PlayArrowIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M8 5v14l11-7z" />
		</Icon>
	);
}

export function PauseIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
		</Icon>
	);
}

export function ReplayIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
		</Icon>
	);
}

export function SkipPreviousIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
		</Icon>
	);
}

export function SkipNextIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
		</Icon>
	);
}

export function SubtitlesIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm0-4H10v-2h10v2z" />
		</Icon>
	);
}

export function AudiotrackIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
		</Icon>
	);
}

export function VideoSettingsIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M3 6h18v5h-2V8H5v8h6v2H3V6z" />
			<path d="M22.71 18.43c.03-.29.04-.58.01-.86l1.07-.85c.1-.08.12-.21.06-.32l-1.03-1.79c-.06-.11-.19-.15-.31-.11L21.23 15c-.23-.17-.48-.31-.75-.42l-.2-1.36a.249.249 0 0 0-.25-.22h-2.07c-.12 0-.23.09-.25.21l-.2 1.36c-.26.11-.51.26-.74.42l-1.28-.5c-.12-.05-.25 0-.31.11l-1.03 1.79c-.06.11-.04.24.06.32l1.07.86c-.03.29-.04.58-.01.86l-1.07.85c-.1.08-.12.21-.06.32l1.03 1.79c.06.11.19.15.31.11l1.27-.5c.23.17.48.31.75.42l.2 1.36c.02.12.12.21.25.21h2.07c.12 0 .23-.09.25-.21l.2-1.36c.26-.11.51-.26.74-.42l1.28.5c.12.05.25 0 .31-.11l1.03-1.79c.06-.11.04-.24-.06-.32l-1.07-.85zM19 19.5c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
		</Icon>
	);
}

export function PlaylistPlayIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M3 10h11v2H3zm0-4h11v2H3zm0 8h7v2H3zm13-1v8l6-4z" />
		</Icon>
	);
}

/** The sender's "tada" logo glyph, extracted from public/images/logo.svg (bbox-normalized). */
export function TadaLogo({ width = 130, height = 158, class: cls }: { width?: number; height?: number; class?: string }) {
	return (
		<svg
			width={width}
			height={height}
			viewBox="0 0 252.8 308.77"
			fill="currentColor"
			aria-hidden="true"
			class={cls}
		>
			<path d="M 57.56 0 L 118.61 9.22 L 99.21 62.64 L 229.27 52.15 L 252.8 85.86 L 127.83 308.77 L 76.95 283.96 L 126.87 193.65 L 78.22 183.79 L 92.53 143.41 C 111.18 147.23 129.84 150.94 148.5 154.54 L 177.12 103.03 L 81.09 109.71 L 54.69 180.93 L 0 170.76 Z" />
		</svg>
	);
}
