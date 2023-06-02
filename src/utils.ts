import { NetworkRequestInfo } from "chromecast-caf-receiver/cast.framework";
import { UrlGenerator } from "./urlGenerator";

export enum ErrorCode {
	UNKNOWN = 100298,
	COMMUNICATION = 666,
}

/** String manipulation START **/

export function substringBefore(originalString: string, delimiter: string) {
	var index = originalString.indexOf(delimiter);
	if (index !== -1) {
		return originalString.substring(0, index);
	}
	return originalString;
}

export function substringAfter(originalString: string, delimiter: string): string {
	var index = originalString.indexOf(delimiter);
	if (index !== -1) {
		return originalString.substring(index + delimiter.length);
	}
	return originalString;
}

/** String manipulation END **/

/** Stream url to proxy url conversion START **/

export const getRedirectUrl = (urlGenerator: UrlGenerator, requestUrl: string) => {
	const proxyUrl = urlGenerator.getProxyUrl();
	if (!proxyUrl) return requestUrl;

	const headers = urlGenerator.getHeaders();
	const textToCheck = substringAfter(substringBefore(decodeURIComponent(requestUrl), "&"), "?url=");
	if (textToCheck.includes(proxyUrl)) {
		const endpoint = textToCheck.split("/").pop();
		const newUrlParam = `${urlGenerator.getHlsUrl()}/${endpoint}`;
		requestUrl = decodeURIComponent(requestUrl).replace(textToCheck, newUrlParam);
	}

	if (requestUrl.startsWith(proxyUrl)) return requestUrl;

	return `${proxyUrl}?url=${encodeURIComponent(requestUrl)}${headers ? `&headers=${encodeURIComponent(JSON.stringify(headers))}` : ""}`;
};

export const redirectHandler = (urlGenerator: UrlGenerator) => {
	return (networkRequestInfo: NetworkRequestInfo): void => {
		if (networkRequestInfo.url) {
			const newUrl = getRedirectUrl(urlGenerator, networkRequestInfo.url);
			networkRequestInfo.url = newUrl;
		}
	};
};

/** Stream url to proxy url conversion END **/
