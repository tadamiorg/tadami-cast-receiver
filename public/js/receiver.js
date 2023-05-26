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

eval("\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nconst utils_1 = __webpack_require__(/*! ./utils */ \"./src/utils.ts\");\nconst context = cast.framework.CastReceiverContext.getInstance();\nconst playerManager = context.getPlayerManager();\nconst playbackConfig = new cast.framework.PlaybackConfig();\nvar getHeaders = () => {\n    return null;\n};\nvar getProxyServerUrl = () => {\n    return null;\n};\nvar getM3u8Url = () => {\n    return null;\n};\nconst getRedirectUrl = (requestUrl) => {\n    const proxyUrl = getProxyServerUrl();\n    if (proxyUrl == null) {\n        return requestUrl;\n    }\n    const headers = getHeaders();\n    const textToCheck = (0, utils_1.substringAfter)((0, utils_1.substringBefore)(decodeURIComponent(requestUrl), \"&\"), \"?url=\");\n    if (textToCheck.includes(proxyUrl)) {\n        const endpoint = textToCheck.split(\"/\").pop();\n        const newUrlParam = `${getM3u8Url()}/${endpoint}`;\n        requestUrl = decodeURIComponent(requestUrl).replace(textToCheck, newUrlParam);\n    }\n    if (requestUrl.startsWith(proxyUrl)) {\n        return requestUrl;\n    }\n    return `${proxyUrl}?url=${encodeURIComponent(requestUrl)}${headers != null ? `&headers=${encodeURIComponent(JSON.stringify(headers))}` : \"\"}`;\n};\n// Handles redirect to the android device proxy\nplaybackConfig.licenseRequestHandler = (0, utils_1.redirectHandler)(getRedirectUrl);\nplaybackConfig.segmentRequestHandler = (0, utils_1.redirectHandler)(getRedirectUrl);\nplaybackConfig.manifestRequestHandler = (0, utils_1.redirectHandler)(getRedirectUrl);\nplayerManager.setMessageInterceptor(cast.framework.messages.MessageType.LOAD, (loadRequestData) => {\n    if (loadRequestData.media && loadRequestData.media.customData) {\n        if (loadRequestData.media.customData.proxyIp) {\n            getProxyServerUrl = () => {\n                return `http://${loadRequestData.media.customData.proxyIp}:8000`;\n            };\n            getM3u8Url = () => {\n                var lastSlashIndex = loadRequestData.media.contentUrl?.lastIndexOf(\"/\");\n                var result = loadRequestData.media.contentUrl?.substring(0, lastSlashIndex);\n                return result || null;\n            };\n        }\n        if (loadRequestData.media.customData.selectedSource.headers) {\n            getHeaders = () => {\n                return loadRequestData.media.customData.selectedSource.headers;\n            };\n        }\n        else {\n            getHeaders = () => {\n                return null;\n            };\n        }\n    }\n    return loadRequestData;\n});\ncontext.start({ playbackConfig: playbackConfig });\n\n\n//# sourceURL=webpack://typescriptreceiver/./src/receiver.ts?");

/***/ }),

/***/ "./src/utils.ts":
/*!**********************!*\
  !*** ./src/utils.ts ***!
  \**********************/
/***/ ((__unused_webpack_module, exports) => {

eval("\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nexports.redirectHandler = exports.substringAfter = exports.substringBefore = void 0;\nfunction substringBefore(originalString, delimiter) {\n    var index = originalString.indexOf(delimiter);\n    if (index !== -1) {\n        return originalString.substring(0, index);\n    }\n    return originalString;\n}\nexports.substringBefore = substringBefore;\nfunction substringAfter(originalString, delimiter) {\n    var index = originalString.indexOf(delimiter);\n    if (index !== -1) {\n        return originalString.substring(index + delimiter.length);\n    }\n    return originalString;\n}\nexports.substringAfter = substringAfter;\nconst redirectHandler = (newUrlGen) => {\n    return (networkRequestInfo) => {\n        if (networkRequestInfo.url) {\n            const newUrl = newUrlGen(networkRequestInfo.url);\n            networkRequestInfo.url = newUrl;\n        }\n    };\n};\nexports.redirectHandler = redirectHandler;\n\n\n//# sourceURL=webpack://typescriptreceiver/./src/utils.ts?");

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