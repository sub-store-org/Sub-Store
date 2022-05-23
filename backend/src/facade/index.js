const $ = require('../core/app');
const { ENV } = require('../utils/open-api');
const { IP_API } = require('../utils/geo');
const Gist = require('../utils/gist');
const { SETTINGS_KEY, GIST_BACKUP_KEY, GIST_BACKUP_FILE_NAME } = require('./constants');

function serve() {
	const express = require('../utils/express');
	const $app = express();

	// register routes
	const collections = require('./collections');
	collections.register($app);

	const subscriptions = require('./subscriptions');
	subscriptions.register($app);

	const settings = require('./settings');
	settings.register($app);

	const artifacts = require('./artifacts');
	artifacts.register($app);

	// utils
	$app.get('/api/utils/IP_API/:server', IP_API); // IP-API reverse proxy
	$app.get('/api/utils/env', getEnv); // get runtime environment
	$app.get('/api/utils/backup', gistBackup); // gist backup actions

	// Redirect sub.store to vercel webpage
	$app.get('/', async (req, res) => {
		// 302 redirect
		res.set('location', 'https://sub-store.vercel.app/').status(302).end();
	});

	// handle preflight request for QX
	if (ENV().isQX) {
		$app.options('/', async (req, res) => {
			res.status(200).end();
		});
	}

	$app.all('/', (_, res) => {
		res.send('Hello from sub-store, made with ❤️ by Peng-YM');
	});

	$app.start();
}

function getEnv(req, res) {
	const { isNode, isQX, isLoon, isSurge } = ENV();
	let backend = 'Node';
	if (isNode) backend = 'Node';
	if (isQX) backend = 'QX';
	if (isLoon) backend = 'Loon';
	if (isSurge) backend = 'Surge';
	res.json({
		backend
	});
}

async function gistBackup(req, res) {
	const { action } = req.query;
	// read token
	const { gistToken } = $.read(SETTINGS_KEY);
	if (!gistToken) {
		res.status(500).json({
			status: 'failed',
			message: '未找到Gist备份Token!'
		});
	} else {
		const gist = new Gist({
			token: gistToken,
			key: GIST_BACKUP_KEY
		});
		try {
			let content;
			switch (action) {
				case 'upload':
					// update syncTime.
					const settings = $.read(SETTINGS_KEY);
					settings.syncTime = new Date().getTime();
					$.write(settings, SETTINGS_KEY);
					content = $.read('#sub-store');
					if ($.env.isNode) content = JSON.stringify($.cache, null, `  `);
					$.info(`上传备份中...`);
					await gist.upload({ [GIST_BACKUP_FILE_NAME]: { content } });
					break;
				case 'download':
					$.info(`还原备份中...`);
					content = await gist.download(GIST_BACKUP_FILE_NAME);
					// restore settings
					$.write(content, '#sub-store');
					if ($.env.isNode) {
						content = JSON.parse(content);
						Object.keys(content).forEach((key) => {
							$.write(content[key], key);
						});
					}
					break;
			}
			res.json({
				status: 'success'
			});
		} catch (err) {
			const msg = `${action === 'upload' ? '上传' : '下载'}备份失败！${err}`;
			$.error(msg);
			res.status(500).json({
				status: 'failed',
				message: msg
			});
		}
	}
}

module.exports = serve;
