const MIHOMO_CONFIG_FILE_TYPE = 'mihomoConfig';
const LEGACY_MIHOMO_CONFIG_FILE_TYPE = 'mihomoProfile';
const MIHOMO_CONFIG_FILE_TYPES = [
    MIHOMO_CONFIG_FILE_TYPE,
    LEGACY_MIHOMO_CONFIG_FILE_TYPE,
];

function isMihomoConfigFile(fileOrType) {
    const type =
        typeof fileOrType === 'string' ? fileOrType : fileOrType?.type;
    return MIHOMO_CONFIG_FILE_TYPES.includes(type);
}

function normalizeFileType(type) {
    return isMihomoConfigFile(type) ? MIHOMO_CONFIG_FILE_TYPE : type;
}

function normalizeFileConfig(file) {
    if (!file) return file;
    if (!isMihomoConfigFile(file)) return file;
    if (file.type === MIHOMO_CONFIG_FILE_TYPE) return file;
    return {
        ...file,
        type: MIHOMO_CONFIG_FILE_TYPE,
    };
}

export {
    LEGACY_MIHOMO_CONFIG_FILE_TYPE,
    MIHOMO_CONFIG_FILE_TYPE,
    MIHOMO_CONFIG_FILE_TYPES,
    isMihomoConfigFile,
    normalizeFileConfig,
    normalizeFileType,
};
