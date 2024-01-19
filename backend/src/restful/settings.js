import { SETTINGS_KEY, ARTIFACT_REPOSITORY_KEY } from '@/constants';
import { success, failed } from './response';
import { InternalServerError } from '@/restful/errors';
import $ from '@/core/app';
import Gist from '@/utils/gist';

export default function register($app) {
    const settings = $.read(SETTINGS_KEY);
    if (!settings) $.write({}, SETTINGS_KEY);
    $app.route('/api/settings').get(getSettings).patch(updateSettings);
}

async function getSettings(req, res) {
    try {
        let settings = $.read(SETTINGS_KEY);
        if (!settings) {
            settings = {};
            $.write(settings, SETTINGS_KEY);
        }

        if (!settings.avatarUrl) await updateGitHubAvatar();
        if (!settings.artifactStore) await updateArtifactStore();

        success(res, settings);
    } catch (e) {
        $.error(`Failed to get settings: ${e.message ?? e}`);
        failed(
            res,
            new InternalServerError(
                `FAILED_TO_GET_SETTINGS`,
                `Failed to get settings`,
                `Reason: ${e.message ?? e}`,
            ),
        );
    }
}

async function updateSettings(req, res) {
    try {
        const settings = $.read(SETTINGS_KEY);
        const newSettings = {
            ...settings,
            ...req.body,
        };
        $.write(newSettings, SETTINGS_KEY);
        await updateGitHubAvatar();
        await updateArtifactStore();
        success(res, newSettings);
    } catch (e) {
        $.error(`Failed to update settings: ${e.message ?? e}`);
        failed(
            res,
            new InternalServerError(
                `FAILED_TO_UPDATE_SETTINGS`,
                `Failed to update settings`,
                `Reason: ${e.message ?? e}`,
            ),
        );
    }
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
        } catch (err) {
            $.error(
                `Failed to fetch GitHub avatar for User: ${username}. Reason: ${
                    err.message ?? err
                }`,
            );
        }
    }
}

export async function updateArtifactStore() {
    $.log('Updating artifact store');
    const settings = $.read(SETTINGS_KEY);
    const { gistToken } = settings;
    if (gistToken) {
        const manager = new Gist({
            token: gistToken,
            key: ARTIFACT_REPOSITORY_KEY,
        });

        try {
            const gist = await manager.locate();
            if (gist?.html_url) {
                $.log(`找到 Sub-Store Gist: ${gist.html_url}`);
                // 只需要保证 token 是对的, 现在 username 错误只会导致头像错误
                settings.artifactStore = gist.html_url;
                settings.artifactStoreStatus = 'VALID';
            } else {
                $.error(`找不到 Sub-Store Gist`);
                settings.artifactStoreStatus = 'NOT FOUND';
            }
        } catch (err) {
            $.error(`查找 Sub-Store Gist 时发生错误: ${err.message ?? err}`);
            settings.artifactStoreStatus = 'ERROR';
        }
        $.write(settings, SETTINGS_KEY);
    }
}
