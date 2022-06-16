import { SETTINGS_KEY } from './constants';
import $ from '@/core/app';

export default function register($app) {
    if (!$.read(SETTINGS_KEY)) $.write({}, SETTINGS_KEY);
    $app.route('/api/settings').get(getSettings).patch(updateSettings);
}

function getSettings(req, res) {
    const settings = $.read(SETTINGS_KEY);
    res.json(settings);
}

function updateSettings(req, res) {
    const data = req.body;
    const settings = $.read(SETTINGS_KEY);
    $.write(
        {
            ...settings,
            ...data,
        },
        SETTINGS_KEY,
    );
    res.json({
        status: 'success',
    });
}
