import { NetworkRequestInfo } from "chromecast-caf-receiver/cast.framework";

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

export const redirectHandler = (newUrlGen: (url: string) => string) => {
	return (networkRequestInfo: NetworkRequestInfo): void => {
		if (networkRequestInfo.url) {
			const newUrl = newUrlGen(networkRequestInfo.url);
			networkRequestInfo.url = newUrl;
		}
	};
};
