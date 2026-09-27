const EDITOR_LANGUAGE_IDS = new Set([
    'javascript',
    'json',
    'json5',
    'yaml',
    'ini',
    'plaintext',
]);

const LANGUAGE_FIELDS = ['editorLanguage', 'previewLanguage'];

function normalizeEditorLanguageField(target) {
    if (!target || typeof target !== 'object') return;

    for (const field of LANGUAGE_FIELDS) {
        if (!EDITOR_LANGUAGE_IDS.has(target[field])) {
            delete target[field];
        }
    }
}

export function normalizeEditorLanguageConfig(config) {
    normalizeEditorLanguageField(config);

    if (!Array.isArray(config?.process)) return;

    config.process.forEach((item) => {
        normalizeEditorLanguageField(item?.args);
    });
}
