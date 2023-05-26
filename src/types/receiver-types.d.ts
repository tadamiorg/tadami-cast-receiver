import { LoadRequestData, MediaInformation } from "chromecast-caf-receiver/cast.framework.messages";

export interface StreamSource {
	url: string;
	quality: string;
	headers?: Map<string, string>;
}

export interface TadamiRequestData {
	proxyIp: string;
	animeId: number;
	episodeId: number;
	availableSources: Array<StreamSource>;
	selectedSource: StreamSource;
}

export class TadamiMediaInformation extends MediaInformation {
	customData?: TadamiRequestData;
}

export class TadamiLoadRequestData extends LoadRequestData {
	media: TadamiMediaInformation;
}
