const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

//Media Sample API Values
const StreamType = {
	DASH: "application/dash+xml",
	HLS: "application/x-mpegurl",
};
const TEST_STREAM_TYPE = StreamType.DASH;

// Debug Logger
const castDebugLogger = cast.debug.CastDebugLogger.getInstance();
const LOG_TAG = "MyAPP.LOG";

// Enable debug logger and show a 'DEBUG MODE' overlay at top left corner.
castDebugLogger.setEnabled(true);

// Show debug overlay
// castDebugLogger.showDebugLogs(true);

// Set verbosity level for Core events.
castDebugLogger.loggerLevelByEvents = {
	"cast.framework.events.category.CORE": cast.framework.LoggerLevel.INFO,
	"cast.framework.events.EventType.MEDIA_STATUS": cast.framework.LoggerLevel.DEBUG,
};

// Set verbosity level for custom tags.
castDebugLogger.loggerLevelByTags = {
	LOG_TAG: cast.framework.LoggerLevel.DEBUG,
};

playerManager.setMessageInterceptor(cast.framework.messages.MessageType.LOAD, (request) => {
	castDebugLogger.info(LOG_TAG, "Intercepting LOAD request");
});

context.start();
