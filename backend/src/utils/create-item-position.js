import { SETTINGS_KEY } from '@/constants';
import $ from '@/core/app';

export function getCreateItemPosition() {
    const createItemPosition =
        $.read(SETTINGS_KEY)?.appearanceSetting?.createItemPosition;

    return createItemPosition === 'top' ? 'top' : 'bottom';
}
