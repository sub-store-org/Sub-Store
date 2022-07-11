import { SETTINGS_KEY, ARTIFACT_REPOSITORY_KEY } from '@/constants';
import { success } from './response';
import $ from '@/core/app';
import Gist from '@/utils/gist';

export default function register($app) {
    const settings = $.read(SETTINGS_KEY);
    if (!settings) $.write({}, SETTINGS_KEY);
    $app.route('/api/settings').get(getSettings).patch(updateSettings);
}

async function getSettings(req, res) {
    const settings = $.read(SETTINGS_KEY);
    if (!settings.avatarUrl) await updateGitHubAvatar();
    if (!settings.artifactStore) await updateArtifactStore();
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
    await updateArtifactStore();
    success(res, newSettings);
}

export async function updateGitHubAvatar() {
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

export async function updateArtifactStore() {
    $.log('Updating artifact store');
    const settings = $.read(SETTINGS_KEY);
    const { githubUser, gistToken } = settings;
    if (githubUser && gistToken) {
        const manager = new Gist({
            token: gistToken,
            key: ARTIFACT_REPOSITORY_KEY,
        });

        try {
            const gistId = await manager.locate();
            if (gistId !== -1) {
                settings.artifactStore = `https://gist.github.com/${githubUser}/${gistId}`;
                $.write(settings, SETTINGS_KEY);
            }
        } catch (err) {
            $.error('Failed to fetch artifact store for User: ' + githubUser);
        }
    }
}
