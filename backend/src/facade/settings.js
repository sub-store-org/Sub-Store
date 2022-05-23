const $ = require('../core/app');
const { SETTINGS_KEY } = require('./constants');

function register($app) {
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
			...data
		},
		SETTINGS_KEY
	);
	res.json({
		status: 'success'
	});
}

module.exports = {
	register
};
