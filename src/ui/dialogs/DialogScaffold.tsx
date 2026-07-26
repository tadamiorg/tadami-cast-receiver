/**
 * Modal scaffold ported from Terebi's TvSelectionDialogs: black@0.85 backdrop, a
 * surface-colored panel 55% wide × 85% tall, titleMedium title, a scrollable list where
 * the selected row is prefixed with "● ", first row autofocus, BACK/Escape closes.
 */

import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { isBackKey } from '../focus';
import './dialogs.css';

export function DialogScaffold({
	title,
	onDismiss,
	children,
}: {
	title: string;
	onDismiss: () => void;
	children: ComponentChildren;
}) {
	// Intercept BACK before the roving-focus system (mirrors onPreviewKeyEvent).
	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if (isBackKey(event)) {
				event.preventDefault();
				event.stopPropagation();
				onDismiss();
			}
		};
		window.addEventListener('keydown', handler, true);
		return () => window.removeEventListener('keydown', handler, true);
	}, [onDismiss]);

	return (
		<div class="dialog-backdrop" data-focus-layer onClick={onDismiss}>
			<div class="dialog-surface" onClick={(e) => e.stopPropagation()}>
				<div class="dialog-title">{title}</div>
				<div class="dialog-list">{children}</div>
			</div>
		</div>
	);
}

export function DialogRow({
	label,
	selected,
	autoFocus = false,
	onClick,
}: {
	label: string;
	selected: boolean;
	autoFocus?: boolean;
	onClick: () => void;
}) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!autoFocus) return;
		const id = setTimeout(() => ref.current?.focus(), 30);
		return () => clearTimeout(id);
	}, [autoFocus]);

	return (
		<div class="dialog-row" role="button" data-focusable tabIndex={-1} ref={ref} onClick={onClick}>
			{selected ? `● ${label}` : label}
		</div>
	);
}
