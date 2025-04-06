import { TadamiRequestData } from "./types/receiver-types";

export class StateHandler {
	private selectedSubtitle?: number;
	private customData?: TadamiRequestData;

	setCustomData(customData: TadamiRequestData) {
		this.customData = customData;
	}

	setSelectedSubtitle(subtitle?: number) {
		this.selectedSubtitle = subtitle;
	}

	resetState() {
		this.selectedSubtitle = undefined;
		this.customData = undefined;
	}
}
