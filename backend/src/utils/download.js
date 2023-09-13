import { FILES_KEY } from '@/constants';
import { findByName } from '@/utils/database';
import { HTTP, ENV } from '@/vendor/open-api';
import { hex_md5 } from '@/vendor/md5';
import resourceCache from '@/utils/resource-cache';
import $ from '@/core/app';

const tasks = new Map();

export default async function download(url, ua) {
    const downloadUrlMatch = url.match(/^\/api\/file\/(.+)/);
    if (downloadUrlMatch) {
        let fileName = downloadUrlMatch?.[1];
        if (fileName == null) {
            throw new Error(`本地文件 URL 无效: ${url}`);
        }
        fileName = decodeURIComponent(fileName);
        const allFiles = $.read(FILES_KEY);
        const file = findByName(allFiles, fileName);
        if (!file) {
            throw new Error(`找不到本地文件: ${fileName}`);
        }
        return file.content;
    }

    const { isNode } = ENV();
    ua = ua || 'Quantumult%20X/1.0.29 (iPhone14,5; iOS 15.4.1)';
    const id = hex_md5(ua + url);
    if (!isNode && tasks.has(id)) {
        return tasks.get(id);
    }

    const http = HTTP({
        headers: {
            'User-Agent': ua,
        },
    });

    const result = new Promise((resolve, reject) => {
        // try to find in app cache
        const cached = resourceCache.get(id);
        if (cached) {
            resolve(cached);
        } else {
            http.get(url)
                .then((resp) => {
                    const body = resp.body;
                    if (body.replace(/\s/g, '').length === 0)
                        reject(new Error('远程资源内容为空！'));
                    else {
                        resourceCache.set(id, body);
                        resolve(body);
                    }
                })
                .catch(() => {
                    reject(new Error(`无法下载 URL：${url}`));
                });
        }
    });

    if (!isNode) {
        tasks.set(id, result);
    }
    return result;
}
