# Tadami Cast Receiver

A Google Cast (CAF) web receiver for the [Tadami](https://github.com/tadamiorg/tadami) app.
It replicates the Tadami Terebi (Android TV) player experience in the Cast browser runtime:
custom controls overlay, subtitles with outline rendering, audio-track / source / episode
switching, quick-seek, and runtime theming from the phone's color scheme — speaking Tadami
cast protocol v3.

Because browsers cannot attach Referer/User-Agent headers to media requests, header-bound
streams are fetched through the **phone-local proxy** started by the Tadami sender for
web-receiver sessions. The proxy is a STATELESS forwarder — the receiver carries the current
source's headers on every wrapped request, and the phone never parses or rewrites stream
payloads:

- `GET {proxyBaseUrl}/proxy?url=<urlencoded-absolute>[&headers=<urlencoded-json-object>]` —
  streamed passthrough of one absolute URL with the carried headers applied.
- `GET {proxyBaseUrl}/echo?body=<enc>&type=<enc>` — reflects a receiver-composed body (used
  for the synthetic multi-audio HLS master).
- `GET {proxyBaseUrl}/health`

Proxy routing is conditional: media rides the proxy only when the current source carries
custom headers (or the target is plain `http://` — blocked mixed content on this https page
otherwise); header-less https sources play raw, sparing the phone the byte relay. Subtitles
are ALWAYS proxied — they are plain `fetch()`es that need the proxy's permissive CORS.
Progressive files (mp4/webm/…) are wrapped at load time when header-bound, because CAF's
request handlers fire only for adaptive streams.

Relative manifest URIs are fixed receiver-side by **proxy-domain detection** (never by
extension): a relative URI resolved by the player against a proxied manifest URL lands on the
proxy origin without being a legit `/proxy?` request; `wrapRequestUrl` re-bases it onto the
last manifest URL and wraps it properly.

`proxyBaseUrl` arrives in the LOAD customData and in handshake messages. The receiver
identifies itself to the phone by replying `{receiverType:"web", receiverProtocol, receiverVersion}`
on `urn:x-cast:com.sf.tadami.handshake` (the native Terebi receiver never replies).

## Stack

- [Preact](https://preactjs.com/) + [@preact/signals](https://preactjs.com/guide/v10/signals/) + TypeScript
- [Vite](https://vite.dev/) (build target `chrome87` for frozen Chromecast runtimes)
- [Vitest](https://vitest.dev/) for unit tests
- Firebase Hosting (deploys `dist/`)

## Development

```sh
npm install
npm run dev        # vite --host (reachable from a Chromecast pointed at the dev app ID)
npm run test       # vitest run
npm run build      # tsc -b && vite build → dist/
```

### Desktop shim

Open `http://localhost:5173/?shim` while `npm run dev` is running: a minimal `window.cast`
stub backed by a plain `<video>` lets you exercise the full UI in desktop Chrome. A small
debug panel provides a canned LOAD fixture, handshake/connect simulation and live
subtitle-style updates. Use keyboard arrows / Enter / Escape as the D-pad.

## Deploy

```sh
npm run deploy:dev    # build + deploy to https://tadami-cast-receiver-dev.web.app (debug cast app ID)
npm run deploy:prod   # build + deploy to https://tadami-cast-receiver.web.app (release app ID)
```

The build is identical for both targets. All diagnostics (console logging, on-screen log overlay,
loading heartbeat to the phone) are gated at runtime on the receiver URL carrying `?debug` — the
dev registration can include it, the production URL never does, so the release receiver is silent.

`firebase-tools` is expected to be installed globally.
