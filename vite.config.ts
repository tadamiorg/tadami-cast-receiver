/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import pkg from './package.json';

export default defineConfig({
	plugins: [preact()],
	define: {
		// Receiver marketing version, reported in the handshake reply and crash logs.
		__RECEIVER_VERSION__: JSON.stringify(pkg.version),
	},
	build: {
		// Chromecast runtimes ship frozen Chrome builds; 1st-gen/Google TV devices sit around 87.
		target: 'chrome87',
		outDir: 'dist',
	},
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts'],
	},
});
