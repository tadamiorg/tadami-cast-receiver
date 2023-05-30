import { TadamiLoadRequestData } from "./types/receiver-types";
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
	if (loadRequestData.media && loadRequestData.media.contentUrl && loadRequestData.media.customData) {
		urlGenerator.resetUrls();
		if (loadRequestData.media.customData.proxyIp) {
			urlGenerator.setProxyUrl(`http://${loadRequestData.media.customData!!.proxyIp}:8000`);
			const lastSlashIndex = loadRequestData.media.contentUrl.lastIndexOf("/");
			const hlsUrl = loadRequestData.media.contentUrl.substring(0, lastSlashIndex);
			urlGenerator.setHlsUrl(hlsUrl);
		}
		if (loadRequestData.media.customData.selectedSource.headers) {
			urlGenerator.setHeaders(loadRequestData.media.customData!!.selectedSource.headers!!);
		}
	}
	return loadRequestData;
});

context.start({ playbackConfig: playbackConfig });
