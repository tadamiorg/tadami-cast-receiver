/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/receiver.ts":
/*!*************************!*\
  !*** ./src/receiver.ts ***!
  \*************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

eval("\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nconst urlGenerator_1 = __webpack_require__(/*! ./urlGenerator */ \"./src/urlGenerator.ts\");\nconst utils_1 = __webpack_require__(/*! ./utils */ \"./src/utils.ts\");\nconst context = cast.framework.CastReceiverContext.getInstance();\nconst playerManager = context.getPlayerManager();\nconst playbackConfig = new cast.framework.PlaybackConfig();\nconst urlGenerator = new urlGenerator_1.UrlGenerator();\n// Handles redirect to the android device proxy\nplaybackConfig.licenseRequestHandler = (0, utils_1.redirectHandler)(urlGenerator);\nplaybackConfig.segmentRequestHandler = (0, utils_1.redirectHandler)(urlGenerator);\nplaybackConfig.manifestRequestHandler = (0, utils_1.redirectHandler)(urlGenerator);\nplayerManager.setMessageInterceptor(cast.framework.messages.MessageType.LOAD, (loadRequestData) => {\n    console.log(loadRequestData);\n    if (!loadRequestData.media || !loadRequestData.media.contentId || !loadRequestData.media.contentUrl || !loadRequestData.media.customData)\n        return loadRequestData;\n    //@ts-ignore\n    delete loadRequestData.media.contentId;\n    urlGenerator.resetUrls();\n    if (!loadRequestData.media.customData.proxyIp)\n        return loadRequestData;\n    urlGenerator.setProxyUrl(`http://${loadRequestData.media.customData.proxyIp}:8000`);\n    const lastSlashIndex = loadRequestData.media.contentUrl.lastIndexOf(\"/\");\n    const hlsUrl = loadRequestData.media.contentUrl.substring(0, lastSlashIndex);\n    urlGenerator.setHlsUrl(hlsUrl);\n    if (!loadRequestData.media.customData.selectedSource)\n        return loadRequestData;\n    const source = JSON.parse(loadRequestData.media.customData.selectedSource);\n    if (!source.headers)\n        return loadRequestData;\n    urlGenerator.setHeaders(source.headers);\n    return loadRequestData;\n});\ncontext.start({ playbackConfig: playbackConfig });\n\n\n//# sourceURL=webpack://tadami-cast-receiver/./src/receiver.ts?");

/***/ }),

/***/ "./src/urlGenerator.ts":
/*!*****************************!*\
  !*** ./src/urlGenerator.ts ***!
  \*****************************/
/***/ ((__unused_webpack_module, exports) => {

eval("\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nexports.UrlGenerator = void 0;\nclass UrlGenerator {\n    headers;\n    proxyUrl;\n    hlsUrl;\n    resetUrls() {\n        this.headers = undefined;\n        this.proxyUrl = undefined;\n        this.hlsUrl = undefined;\n    }\n    getHeaders() {\n        return this.headers;\n    }\n    getProxyUrl() {\n        return this.proxyUrl;\n    }\n    getHlsUrl() {\n        return this.hlsUrl;\n    }\n    setHeaders(headers) {\n        this.headers = headers;\n    }\n    setProxyUrl(proxyUrl) {\n        this.proxyUrl = proxyUrl;\n    }\n    setHlsUrl(hlsUrl) {\n        this.hlsUrl = hlsUrl;\n    }\n}\nexports.UrlGenerator = UrlGenerator;\n\n\n//# sourceURL=webpack://tadami-cast-receiver/./src/urlGenerator.ts?");

/***/ }),

/***/ "./src/utils.ts":
/*!**********************!*\
  !*** ./src/utils.ts ***!
  \**********************/
/***/ ((__unused_webpack_module, exports) => {

eval("\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nexports.redirectHandler = exports.getRedirectUrl = exports.substringAfter = exports.substringBefore = void 0;\n/** String manipulation START **/\nfunction substringBefore(originalString, delimiter) {\n    var index = originalString.indexOf(delimiter);\n    if (index !== -1) {\n        return originalString.substring(0, index);\n    }\n    return originalString;\n}\nexports.substringBefore = substringBefore;\nfunction substringAfter(originalString, delimiter) {\n    var index = originalString.indexOf(delimiter);\n    if (index !== -1) {\n        return originalString.substring(index + delimiter.length);\n    }\n    return originalString;\n}\nexports.substringAfter = substringAfter;\n/** String manipulation END **/\n/** Stream url to proxy url conversion START **/\nconst getRedirectUrl = (urlGenerator, requestUrl) => {\n    const proxyUrl = urlGenerator.getProxyUrl();\n    if (!proxyUrl)\n        return requestUrl;\n    const headers = urlGenerator.getHeaders();\n    const textToCheck = substringAfter(substringBefore(decodeURIComponent(requestUrl), \"&\"), \"?url=\");\n    if (textToCheck.includes(proxyUrl)) {\n        const endpoint = textToCheck.split(\"/\").pop();\n        const newUrlParam = `${urlGenerator.getHlsUrl()}/${endpoint}`;\n        requestUrl = decodeURIComponent(requestUrl).replace(textToCheck, newUrlParam);\n    }\n    if (requestUrl.startsWith(proxyUrl))\n        return requestUrl;\n    return `${proxyUrl}?url=${encodeURIComponent(requestUrl)}${headers ? `&headers=${encodeURIComponent(JSON.stringify(headers))}` : \"\"}`;\n};\nexports.getRedirectUrl = getRedirectUrl;\nconst redirectHandler = (urlGenerator) => {\n    return (networkRequestInfo) => {\n        if (networkRequestInfo.url) {\n            const newUrl = (0, exports.getRedirectUrl)(urlGenerator, networkRequestInfo.url);\n            networkRequestInfo.url = newUrl;\n        }\n    };\n};\nexports.redirectHandler = redirectHandler;\n/** Stream url to proxy url conversion END **/\n\n\n//# sourceURL=webpack://tadami-cast-receiver/./src/utils.ts?");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module can't be inlined because the eval devtool is used.
/******/ 	var __webpack_exports__ = __webpack_require__("./src/receiver.ts");
/******/ 	
/******/ })()
;