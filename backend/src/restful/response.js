export function success(resp, data, statusCode) {
    resp.status(statusCode || 200).json({
        status: 'success',
        data,
    });
}

export function failed(resp, error, statusCode) {
    resp.status(statusCode || 500).json({
        status: 'failed',
        error: {
            code: error.code,
            type: error.type,
            message: error.message,
            details: resp.req?.route?.path?.startsWith('/share/')
                ? '详情请查看日志'
                : error.details,
        },
    });
}
