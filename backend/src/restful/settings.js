import { SETTINGS_KEY } from '@/constants';
import { success } from './response';
import $ from '@/core/app';

export default function register($app) {
    const settings = $.read(SETTINGS_KEY);
    if (!settings) $.write({}, SETTINGS_KEY);
    if (!settings.avatarUrl) updateGitHubAvatar();
    $app.route('/api/settings').get(getSettings).patch(updateSettings);
}

function getSettings(req, res) {
    const settings = $.read(SETTINGS_KEY);
    success(res, settings);
}

async function updateSettings(req, res) {
    const settings = $.read(SETTINGS_KEY);
    const newSettings = {
        ...settings,
        ...req.body,
    };
    $.write(newSettings, SETTINGS_KEY);
    await updateGitHubAvatar();
    success(res, newSettings);
}

async function updateGitHubAvatar() {
    const settings = $.read(SETTINGS_KEY);
    const username = settings.githubUser;
    if (username) {
        try {
            const data = await $.http
                .get({
                    url: `https://api.github.com/users/${username}`,
                    headers: {
                        'User-Agent':
                            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.141 Safari/537.36',
                    },
                })
                .then((resp) => JSON.parse(resp.body));
            settings.avatarUrl = data['avatar_url'];
            $.write(settings, SETTINGS_KEY);
        } catch (e) {
            $.error('Failed to fetch GitHub avatar for User: ' + username);
        }
    }
}
