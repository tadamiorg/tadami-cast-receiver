/**
 * Pushes Tadami error codes to the phone over `urn:x-cast:com.sf.tadami.error`
 * (666 = communication, 104 = protocol mismatch, 905 = media load failed).
 */

import { ERROR_NAMESPACE, type CastErrorCodeValue, type TadamiCastError } from './protocol';

export function reportCastError(code: CastErrorCodeValue | number, detail?: string): void {
	try {
		const context = cast.framework.CastReceiverContext.getInstance();
		const error: TadamiCastError = { errorCode: code };
		if (detail !== undefined && detail !== '') error.detail = detail;
		context.sendCustomMessage(ERROR_NAMESPACE, undefined, error);
	} catch {
		// No session / context not started — nothing to report to.
	}
}
