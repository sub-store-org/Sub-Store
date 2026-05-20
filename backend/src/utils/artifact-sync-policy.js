import { hasGistSyncCredentials } from '@/utils/gist';

function shouldUploadArtifactForCron(artifact) {
    return artifact?.upload !== false;
}

function resolveCronArtifactSyncPolicy({ artifacts = [], settings = {} } = {}) {
    const hasUploadCredentials = hasGistSyncCredentials(settings);
    const shouldSync = artifacts.some((artifact) => artifact.sync);
    const shouldProduceWithUpload = artifacts.some(
        (artifact) => artifact.sync && shouldUploadArtifactForCron(artifact),
    );
    const shouldProduceWithoutUpload = artifacts.some(
        (artifact) => artifact.sync && !shouldUploadArtifactForCron(artifact),
    );

    return {
        canUpload: hasUploadCredentials || !shouldProduceWithUpload,
        shouldRun:
            shouldSync && (hasUploadCredentials || shouldProduceWithoutUpload),
    };
}

function shouldSkipCronArtifactWithoutUploadCredentials(
    artifact,
    { canUpload },
) {
    return !canUpload && shouldUploadArtifactForCron(artifact);
}

export {
    resolveCronArtifactSyncPolicy,
    shouldSkipCronArtifactWithoutUploadCredentials,
};
