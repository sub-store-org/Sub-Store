import { DEFAULT_SCRIPT_CACHE_TTL } from '@/constants';
import { createCFResourceCache } from './resource-cache';

export default createCFResourceCache({
    bucket: 'rc:script',
    settingKey: 'scriptCacheTtl',
    defaultTTL: DEFAULT_SCRIPT_CACHE_TTL,
});
