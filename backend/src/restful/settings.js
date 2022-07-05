import { SETTINGS_KEY } from '@/constants';
import { success } from './response';
import $ from '@/core/app';

export default function register($app) {
    if (!$.read(SETTINGS_KEY)) $.write({}, SETTINGS_KEY);
    $app.route('/api/settings').get(getSettings).patch(updateSettings);
}

function getSettings(req, res) {
    const settings = $.read(SETTINGS_KEY);
    success(res, settings);
}

function updateSettings(req, res) {
    const settings = $.read(SETTINGS_KEY);
    const newSettings = {
        ...settings,
        ...req.body,
    };
    $.write(newSettings, SETTINGS_KEY);
    success(res, newSettings);
}
