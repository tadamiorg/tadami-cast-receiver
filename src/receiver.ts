import { StreamSource, TadamiLoadRequestData } from "./types/receiver-types";
import { UrlGenerator } from "./urlGenerator";
import { redirectHandler } from "./utils";

const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();
const playbackConfig = new cast.framework.PlaybackConfig();
const urlGenerator = new UrlGenerator();

// Handles redirect to the android device proxy
playbackConfig.licenseRequestHandler = redirectHandler(urlGenerator);
playbackConfig.segmentRequestHandler = redirectHandler(urlGenerator);
playbackConfig.manifestRequestHandler = redirectHandler(urlGenerator);

playerManager.setMessageInterceptor(cast.framework.messages.MessageType.LOAD, (loadRequestData: TadamiLoadRequestData) => {
	console.log(loadRequestData);

	if (!loadRequestData.media || !loadRequestData.media.contentId || !loadRequestData.media.contentUrl || !loadRequestData.media.customData) return loadRequestData;

	//@ts-ignore
	delete loadRequestData.media.contentId;

	urlGenerator.resetUrls();

	if (!loadRequestData.media.customData.proxyIp) return loadRequestData;

	urlGenerator.setProxyUrl(`http://${loadRequestData.media.customData!!.proxyIp}:8000`);
	const lastSlashIndex = loadRequestData.media.contentUrl.lastIndexOf("/");
	const hlsUrl = loadRequestData.media.contentUrl.substring(0, lastSlashIndex);
	urlGenerator.setHlsUrl(hlsUrl);

	if (!loadRequestData.media.customData.selectedSource) return loadRequestData;

	const source: StreamSource = JSON.parse(loadRequestData.media.customData.selectedSource);

	if (!source.headers) return loadRequestData;

	urlGenerator.setHeaders(source.headers);

	return loadRequestData;
});

context.start({ playbackConfig: playbackConfig });
