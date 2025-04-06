import { EditTracksInfoRequestData, LoadRequestData } from "chromecast-caf-receiver/cast.framework.messages";
import { StreamSource, TadamiCastError, TadamiLoadRequestData } from "./types/receiver-types";
import { UrlGenerator } from "./urlGenerator";
import { ErrorCode, redirectHandler } from "./utils";
import { StateHandler } from "./stateHandler";

//@ts-ignore
window.location.reload(true);
const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();
const playbackConfig = new cast.framework.PlaybackConfig();
const urlGenerator = new UrlGenerator();
const errorChannel = "urn:x-cast:com.sf.tadami.error";
const appState = new StateHandler();

// Handles redirect to the android device proxy
playbackConfig.licenseRequestHandler = redirectHandler(urlGenerator);
playbackConfig.segmentRequestHandler = redirectHandler(urlGenerator);
playbackConfig.manifestRequestHandler = redirectHandler(urlGenerator);

// Debug Logger
const castDebugLogger = cast.debug.CastDebugLogger.getInstance();
const LOG_TAG = "MyAPP.LOG";

castDebugLogger.setEnabled(true);

// Show debug overlay.
castDebugLogger.showDebugLogs(true);

// Clear log messages on debug overlay.
castDebugLogger.clearDebugLogs();

// Set verbosity level for Core events.
castDebugLogger.loggerLevelByEvents = {
	"cast.framework.events.category.CORE": cast.framework.LoggerLevel.INFO,
	"cast.framework.events.EventType.MEDIA_STATUS": cast.framework.LoggerLevel.DEBUG,
};

// Set verbosity level for custom tags.
castDebugLogger.loggerLevelByTags = {
	LOG_TAG: cast.framework.LoggerLevel.DEBUG, // display all levels
};

context.addEventListener(cast.framework.system.EventType.ERROR, (event) => {
	const tadamiError: TadamiCastError = { errorCode: ErrorCode.COMMUNICATION };
	context.sendCustomMessage(errorChannel, undefined, tadamiError);
});

playerManager.addEventListener(cast.framework.events.EventType.ERROR, (event) => {
	const tadamiError: TadamiCastError = { errorCode: event.detailedErrorCode ?? ErrorCode.UNKNOWN };
	context.sendCustomMessage(errorChannel, undefined, tadamiError);
});

playerManager.setMessageInterceptor(cast.framework.messages.MessageType.EDIT_TRACKS_INFO, (data: EditTracksInfoRequestData) => {
	if (!data.activeTrackIds?.length) return data;
	appState.setSelectedSubtitle(data.activeTrackIds?.[0]);
	return data;
});

playerManager.setMessageInterceptor(cast.framework.messages.MessageType.LOAD, (loadRequestData: LoadRequestData) => {
	castDebugLogger.error(LOG_TAG, "Test error log");

	castDebugLogger.warn(LOG_TAG, "Test warn log");

	castDebugLogger.info(LOG_TAG, "Intercepting LOAD request", loadRequestData);

	castDebugLogger.debug(LOG_TAG, "Test debug log");
	const customLoadRequestData = loadRequestData as TadamiLoadRequestData;
	if (!customLoadRequestData.media || !customLoadRequestData.media.contentId || !customLoadRequestData.media.contentUrl || !customLoadRequestData.media.customData) return customLoadRequestData;

	//@ts-ignore
	delete customLoadRequestData.media.contentId;

	urlGenerator.resetUrls();
	appState.resetState();

	if (!customLoadRequestData.media.customData.proxyIp) return customLoadRequestData;

	appState.setCustomData(customLoadRequestData.media.customData);

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
