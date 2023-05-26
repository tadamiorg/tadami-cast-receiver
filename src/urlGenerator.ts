export class UrlGenerator {
	private headers?: Map<string, string>;
	private proxyUrl?: string;
	private hlsUrl?: string;

	resetUrls() {
		this.headers = undefined;
		this.proxyUrl = undefined;
		this.hlsUrl = undefined;
	}

	getHeaders() {
		return this.headers;
	}

	getProxyUrl() {
		return this.proxyUrl;
	}

	getHlsUrl() {
		return this.hlsUrl;
	}

	setHeaders(headers: Map<string, string>) {
		this.headers = headers;
	}
	setProxyUrl(proxyUrl: string) {
		this.proxyUrl = proxyUrl;
	}
	setHlsUrl(hlsUrl: string) {
		this.hlsUrl = hlsUrl;
	}
}
