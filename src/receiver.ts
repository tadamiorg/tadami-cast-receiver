import { NullableString, TadamiLoadRequestData } from "./types/receiver-types";
import { redirectHandler, substringAfter, substringBefore } from "./utils";

const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();
const playbackConfig = new cast.framework.PlaybackConfig();

var getHeaders = (): Map<string, string> | null => {
	return null;
};

var getProxyServerUrl = (): NullableString => {
	return null;
};
var getM3u8Url = (): NullableString => {
	return null;
};

const getRedirectUrl = (requestUrl: string) => {
	const proxyUrl = getProxyServerUrl();
	if (proxyUrl == null) {
		return requestUrl;
	}
	const headers = getHeaders();
	const textToCheck = substringAfter(substringBefore(decodeURIComponent(requestUrl), "&"), "?url=");
	if (textToCheck.includes(proxyUrl)) {
		const endpoint = textToCheck.split("/").pop();
		const newUrlParam = `${getM3u8Url()}/${endpoint}`;
		requestUrl = decodeURIComponent(requestUrl).replace(textToCheck, newUrlParam);
	}
	if (requestUrl.startsWith(proxyUrl)) {
		return requestUrl;
	}
	return `${proxyUrl}?url=${encodeURIComponent(requestUrl)}${headers != null ? `&headers=${encodeURIComponent(JSON.stringify(headers))}` : ""}`;
};

// Handles redirect to the android device proxy
playbackConfig.licenseRequestHandler = redirectHandler(getRedirectUrl);
playbackConfig.segmentRequestHandler = redirectHandler(getRedirectUrl);
playbackConfig.manifestRequestHandler = redirectHandler(getRedirectUrl);

playerManager.setMessageInterceptor(cast.framework.messages.MessageType.LOAD, (loadRequestData: TadamiLoadRequestData) => {
	if (loadRequestData.media && loadRequestData.media.customData) {
		if (loadRequestData.media.customData.proxyIp) {
			getProxyServerUrl = () => {
				return `http://${loadRequestData.media.customData!!.proxyIp}:8000`;
			};
			getM3u8Url = () => {
				var lastSlashIndex = loadRequestData.media.contentUrl?.lastIndexOf("/");
				var result = loadRequestData.media.contentUrl?.substring(0, lastSlashIndex);
				return result || null;
			};
		}
		if (loadRequestData.media.customData.selectedSource.headers) {
			getHeaders = () => {
				return loadRequestData.media.customData!!.selectedSource.headers!!;
			};
		} else {
			getHeaders = () => {
				return null;
			};
		}
	}
	return loadRequestData;
});

context.start({ playbackConfig: playbackConfig });
