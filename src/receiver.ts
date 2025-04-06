import { LoadRequestData } from "chromecast-caf-receiver/cast.framework.messages";
import { StreamSource, TadamiCastError, TadamiLoadRequestData } from "./types/receiver-types";
import { UrlGenerator } from "./urlGenerator";
import { ErrorCode, redirectHandler } from "./utils";

const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();
const playbackConfig = new cast.framework.PlaybackConfig();
const urlGenerator = new UrlGenerator();
const errorChannel = "urn:x-cast:com.sf.tadami.error";

// Handles redirect to the android device proxy
playbackConfig.licenseRequestHandler = redirectHandler(urlGenerator);
playbackConfig.segmentRequestHandler = redirectHandler(urlGenerator);
playbackConfig.manifestRequestHandler = redirectHandler(urlGenerator);

context.addEventListener(cast.framework.system.EventType.ERROR, (event) => {
	const tadamiError: TadamiCastError = { errorCode: ErrorCode.COMMUNICATION };
	context.sendCustomMessage(errorChannel, undefined, tadamiError);
});

playerManager.addEventListener(cast.framework.events.EventType.ERROR, (event) => {
	const tadamiError: TadamiCastError = { errorCode: event.detailedErrorCode ?? ErrorCode.UNKNOWN };
	context.sendCustomMessage(errorChannel, undefined, tadamiError);
});

playerManager.setMessageInterceptor(cast.framework.messages.MessageType.LOAD, (loadRequestData: LoadRequestData) => {
	const customLoadRequestData = loadRequestData as TadamiLoadRequestData;
	if (!customLoadRequestData.media || !customLoadRequestData.media.contentId || !customLoadRequestData.media.contentUrl || !customLoadRequestData.media.customData) return customLoadRequestData;

	//@ts-ignore
	delete customLoadRequestData.media.contentId;

	urlGenerator.resetUrls();

	if (!customLoadRequestData.media.customData.proxyIp) return customLoadRequestData;

	urlGenerator.setProxyUrl(`http://${customLoadRequestData.media.customData!!.proxyIp}:8000`);
	const lastSlashIndex = customLoadRequestData.media.contentUrl.lastIndexOf("/");
	const hlsUrl = customLoadRequestData.media.contentUrl.substring(0, lastSlashIndex);
	urlGenerator.setHlsUrl(hlsUrl);

	if (!customLoadRequestData.media.customData.selectedSource) return customLoadRequestData;

	const source: StreamSource = JSON.parse(customLoadRequestData.media.customData.selectedSource);

	if (!source.headers) return customLoadRequestData;

	urlGenerator.setHeaders(source.headers);

	return customLoadRequestData;
});

context.start({
	playbackConfig: playbackConfig,
	customNamespaces: {
		[errorChannel]: cast.framework.system.MessageType.JSON,
	},
});
