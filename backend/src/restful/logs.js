import $ from '@/core/app';
import { InternalServerError, RequestInvalidError } from '@/restful/errors';
import { failed, success } from '@/restful/response';
import { clearLogEntries, getLogEntries } from '@/utils/debug-logs';

export default function register($app) {
    $app.route('/api/logs').get(getLogs).delete(clearLogs);
}

function getLogs(req, res) {
    try {
        success(res, getLogEntries($, req.query || {}));
    } catch (e) {
        if (e instanceof SyntaxError) {
            failed(
                res,
                new RequestInvalidError(
                    'INVALID_LOG_KEYWORD_REGEX',
                    'Invalid log keyword regular expression',
                    `Reason: ${e.message ?? e}`,
                ),
                400,
            );
            return;
        }

        failed(
            res,
            new InternalServerError(
                'FAILED_TO_GET_LOGS',
                'Failed to get logs',
                `Reason: ${e.message ?? e}`,
            ),
        );
    }
}

function clearLogs(req, res) {
    try {
        clearLogEntries($);
        success(res);
    } catch (e) {
        failed(
            res,
            new InternalServerError(
                'FAILED_TO_CLEAR_LOGS',
                'Failed to clear logs',
                `Reason: ${e.message ?? e}`,
            ),
        );
    }
}
