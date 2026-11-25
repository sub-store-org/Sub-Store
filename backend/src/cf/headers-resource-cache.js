import { DEFAULT_HEADERS_CACHE_TTL } from '@/constants';
import { createCFResourceCache } from './resource-cache';

export default createCFResourceCache({
    bucket: 'rc:headers',
    settingKey: 'headersCacheTtl',
    defaultTTL: DEFAULT_HEADERS_CACHE_TTL,
});
