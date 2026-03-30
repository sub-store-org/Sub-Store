import {
    ARTIFACTS_KEY,
    COLLECTIONS_KEY,
    SUBS_KEY,
    FILES_KEY,
    TOKENS_KEY,
} from '@/constants';
import $ from '@/core/app';
import { success } from '@/restful/response';
import { sortArchiveEntries } from '@/utils/archive';

export default function register($app) {
    $app.post('/api/sort/subs', sortSubs);
    $app.post('/api/sort/collections', sortCollections);
    $app.post('/api/sort/artifacts', sortArtifacts);
    $app.post('/api/sort/files', sortFiles);
    $app.post('/api/sort/tokens', sortTokens);
    $app.post('/api/sort/archives', sortArchive);
}

function sortSubs(req, res) {
    const orders = req.body;
    const allSubs = $.read(SUBS_KEY);
    allSubs.sort((a, b) => orders.indexOf(a.name) - orders.indexOf(b.name));
    $.write(allSubs, SUBS_KEY);
    success(res, allSubs);
}

function sortCollections(req, res) {
    const orders = req.body;
    const allCols = $.read(COLLECTIONS_KEY);
    allCols.sort((a, b) => orders.indexOf(a.name) - orders.indexOf(b.name));
    $.write(allCols, COLLECTIONS_KEY);
    success(res, allCols);
}

function sortArtifacts(req, res) {
    const orders = req.body;
    const allArtifacts = $.read(ARTIFACTS_KEY);
    allArtifacts.sort(
        (a, b) => orders.indexOf(a.name) - orders.indexOf(b.name),
    );
    $.write(allArtifacts, ARTIFACTS_KEY);
    success(res, allArtifacts);
}

function sortFiles(req, res) {
    const orders = req.body;
    const allFiles = $.read(FILES_KEY);
    allFiles.sort((a, b) => orders.indexOf(a.name) - orders.indexOf(b.name));
    $.write(allFiles, FILES_KEY);
    success(res, allFiles);
}

function sortTokens(req, res) {
    const orders = req.body;
    const allTokens = $.read(TOKENS_KEY);
    allTokens.sort(
        (a, b) =>
            orders.indexOf(`${a.type}-${a.name}-${a.token}`) -
            orders.indexOf(`${b.type}-${b.name}-${b.token}`),
    );
    $.write(allTokens, TOKENS_KEY);
    success(res, allTokens);
}

function sortArchive(req, res) {
    const entries = sortArchiveEntries(req.body);
    success(res, entries);
}
