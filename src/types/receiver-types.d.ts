import { LoadRequestData, MediaInformation, MediaInformationCustomData } from "chromecast-caf-receiver/cast.framework.messages";

export interface StreamSource {
	url: string;
	quality: string;
	headers?: Map<string, string>;
}

export interface TadamiRequestData extends MediaInformationCustomData {
	proxyIp: string;
	animeId: number;
	episodeId: number;
	availableSources: string;
	selectedSource: string;
}

export interface TadamiCastError {
	errorCode?: number;
}

export class TadamiMediaInformation extends MediaInformation {
	customData?: TadamiRequestData;
}

export class TadamiLoadRequestData extends LoadRequestData {
	media: TadamiMediaInformation;
}
