import nunjucks from 'nunjucks';
import { ProxyUtils } from '@/core/proxy-utils';
import { produceArtifact } from '@/restful/sync';
import lodash from 'lodash';
import $ from '@/core/app';
import scriptResourceCache from '@/utils/script-resource-cache';
import { getFlowHeaders, parseFlowHeaders, flowTransfer } from '@/utils/flow';
const flowUtils = { getFlowHeaders, parseFlowHeaders, flowTransfer };
const n = nunjucks.configure({ autoescape: false });

n.addFilter(
    'produceArtifact',
    (...args) => {
        const callback = args.pop();
        const name = args[0];
        const type = args[1];
        const platform = args[2];
        const produceType = args[3];
        const nameRegex = args[4];
        const nameRegexFlags = args[5];
        produceArtifact({
            type,
            name,
            platform,
            produceType,
        })
            .then((artifact) => {
                callback(
                    null,
                    artifact.filter(({ tag }) =>
                        nameRegex
                            ? new RegExp(nameRegex, nameRegexFlags).test(tag)
                            : true,
                    ),
                );
            })
            .catch((e) => {
                $.error(`produceArtifact filter error: ${e.message ?? e}`);
                callback(e);
            });
    },
    true,
);
n.addFilter(
    'subNode',
    (...args) => {
        const callback = args.pop();
        const name = args[0];
        const nameRegex = args[1];
        const nameRegexFlags = args[2];
        produceArtifact({
            type: 'subscription',
            name,
            platform: 'sing-box',
            produceType: 'internal',
        })
            .then((artifact) => {
                callback(
                    null,
                    JSON.stringify(
                        artifact.filter(({ tag }) =>
                            nameRegex
                                ? new RegExp(nameRegex, nameRegexFlags).test(
                                      tag,
                                  )
                                : true,
                        ),
                    ).replace(/(^\[|\]$)/g, ''),
                );
            })
            .catch((e) => {
                $.error(`subNode filter error: ${e.message ?? e}`);
                callback(e);
            });
    },
    true,
);
n.addFilter(
    'colNode',
    (...args) => {
        const callback = args.pop();
        const name = args[0];
        const nameRegex = args[1];
        const nameRegexFlags = args[2];
        produceArtifact({
            type: 'collection',
            name,
            platform: 'sing-box',
            produceType: 'internal',
        })
            .then((artifact) => {
                callback(
                    null,
                    JSON.stringify(
                        artifact.filter(({ tag }) =>
                            nameRegex
                                ? new RegExp(nameRegex, nameRegexFlags).test(
                                      tag,
                                  )
                                : true,
                        ),
                    ).replace(/(^\[|\]$)/g, ''),
                );
            })
            .catch((e) => {
                $.error(`colNode filter error: ${e.message ?? e}`);
                callback(e);
            });
    },
    true,
);
n.addFilter(
    'sub',
    (...args) => {
        const callback = args.pop();
        const name = args[0];
        const nameRegex = args[1];
        const nameRegexFlags = args[2];
        produceArtifact({
            type: 'subscription',
            name,
            platform: 'sing-box',
            produceType: 'internal',
        })
            .then((artifact) => {
                callback(
                    null,
                    JSON.stringify(
                        artifact
                            .filter(({ tag }) =>
                                nameRegex
                                    ? new RegExp(
                                          nameRegex,
                                          nameRegexFlags,
                                      ).test(tag)
                                    : true,
                            )
                            .map((p) => p.tag),
                    ).replace(/(^\[|\]$)/g, ''),
                );
            })
            .catch((e) => {
                $.error(`sub filter error: ${e.message ?? e}`);
                callback(e);
            });
    },
    true,
);
n.addFilter(
    'col',
    (...args) => {
        const callback = args.pop();
        const name = args[0];
        const nameRegex = args[1];
        const nameRegexFlags = args[2];
        produceArtifact({
            type: 'collection',
            name,
            platform: 'sing-box',
            produceType: 'internal',
        })
            .then((artifact) => {
                callback(
                    null,
                    JSON.stringify(
                        artifact
                            .filter(({ tag }) =>
                                nameRegex
                                    ? new RegExp(
                                          nameRegex,
                                          nameRegexFlags,
                                      ).test(tag)
                                    : true,
                            )
                            .map((p) => p.tag),
                    ).replace(/(^\[|\]$)/g, ''),
                );
            })
            .catch((e) => {
                $.error(`col filter error: ${e.message ?? e}`);
                callback(e);
            });
    },
    true,
);

export const render = async (tpl = '', data = {}) => {
    return new Promise((resolve) => {
        n.renderString(
            tpl,
            {
                $substore: $,
                lodash: lodash,
                ProxyUtils: ProxyUtils,
                scriptResourceCache: scriptResourceCache,
                flowUtils: flowUtils,
                // produceArtifact: produceArtifact,
                ...data,
            },
            (e, result) => {
                if (e) {
                    $.error(`rendering error: ${e.message ?? e}`);
                    resolve('');
                } else {
                    resolve(result);
                }
            },
        );
    });
};
