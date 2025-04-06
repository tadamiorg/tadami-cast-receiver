// Debug Logger
const castDebugLogger = cast.debug.CastDebugLogger.getInstance();
const LOG_TAG = "MyAPP.LOG";

function setupCastDebugLogger() {
	// Enable debug logger and show a 'DEBUG MODE' overlay at top left corner.
	castDebugLogger.setEnabled(true);

	// Show debug overlay
	castDebugLogger.showDebugLogs(true);

	// Set verbosity level for Core events.
	castDebugLogger.loggerLevelByEvents = {
		"cast.framework.events.category.CORE": cast.framework.LoggerLevel.INFO,
		"cast.framework.events.EventType.MEDIA_STATUS": cast.framework.LoggerLevel.INFO,
	};

	// Set verbosity level for custom tags.
	castDebugLogger.loggerLevelByTags = {
		LOG_TAG: cast.framework.LoggerLevel.INFO,
	};
}

export { castDebugLogger, LOG_TAG, setupCastDebugLogger };
