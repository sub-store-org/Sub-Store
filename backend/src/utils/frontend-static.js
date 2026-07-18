const GZIP_SUFFIX = '.gz';
const HASHED_ASSET = /-[0-9a-f]{8}\.[^/\\]+$/i;

export function isHashedFrontendAsset(filePath) {
    return HASHED_ASSET.test(filePath);
}

export function createFrontendStaticMiddleware(root, fallbackPath) {
    const express = eval(`require("express")`);
    const mime = eval(`require("mime-types")`);
    const staticFiles = express.static(root, {
        setHeaders(res, filePath) {
            const isGzip = filePath.endsWith(GZIP_SUFFIX);
            const logicalPath = isGzip
                ? filePath.slice(0, -GZIP_SUFFIX.length)
                : filePath;
            const contentType = mime.contentType(mime.lookup(logicalPath));

            if (contentType) res.setHeader('Content-Type', contentType);
            if (isGzip) res.setHeader('Content-Encoding', 'gzip');
            res.vary('Accept-Encoding');
            res.setHeader(
                'Cache-Control',
                isHashedFrontendAsset(logicalPath)
                    ? 'public, max-age=31536000, immutable'
                    : 'public, max-age=0',
            );
        },
    });

    function serveFile(req, res, next) {
        if (req.acceptsEncodings(['gzip', 'identity']) !== 'gzip') {
            staticFiles(req, res, next);
            return;
        }

        const originalUrl = req.url;
        req.url = appendGzipSuffix(originalUrl);
        staticFiles(req, res, (error) => {
            req.url = originalUrl;
            if (error) next(error);
            else staticFiles(req, res, next);
        });
        req.url = originalUrl;
    }

    if (!fallbackPath) return serveFile;

    return (req, res, next) => {
        const originalUrl = req.url;
        serveFile(req, res, (error) => {
            if (error) {
                next(error);
                return;
            }
            req.url = fallbackPath;
            serveFile(req, res, (fallbackError) => {
                req.url = originalUrl;
                next(fallbackError);
            });
            req.url = originalUrl;
        });
    };
}

function appendGzipSuffix(url) {
    const queryStart = url.indexOf('?');
    if (queryStart === -1) return `${url}${GZIP_SUFFIX}`;
    return `${url.slice(0, queryStart)}${GZIP_SUFFIX}${url.slice(queryStart)}`;
}
