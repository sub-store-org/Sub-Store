import {
    SUBS_KEY,
    COLLECTIONS_KEY,
    SCHEMA_VERSION_KEY,
    ARTIFACTS_KEY,
    RULES_KEY,
} from '@/constants';
import $ from '@/core/app';

export default function migrate() {
    migrateV2();
}

function migrateV2() {
    const version = $.read(SCHEMA_VERSION_KEY);
    if (!version) doMigrationV2();

    // write the current version
    if (version !== '2.0') {
        $.write('2.0', SCHEMA_VERSION_KEY);
    }
}

function doMigrationV2() {
    $.info('Start migrating...');
    // 1. migrate subscriptions
    const subs = $.read(SUBS_KEY) || {};
    const newSubs = Object.values(subs).map((sub) => {
        // set default source to remote
        sub.source = sub.source || 'remote';

        migrateDisplayName(sub);
        migrateProcesses(sub);
        return sub;
    });
    $.write(newSubs, SUBS_KEY);

    // 2. migrate collections
    const collections = $.read(COLLECTIONS_KEY) || {};
    const newCollections = Object.values(collections).map((collection) => {
        delete collection.ua;
        migrateDisplayName(collection);
        migrateProcesses(collection);
        return collection;
    });
    $.write(newCollections, COLLECTIONS_KEY);

    // 3. migrate artifacts
    const artifacts = $.read(ARTIFACTS_KEY) || {};
    const newArtifacts = Object.values(artifacts);
    $.write(newArtifacts, ARTIFACTS_KEY);

    // 4. migrate rules
    const rules = $.read(RULES_KEY) || {};
    const newRules = Object.values(rules);
    $.write(newRules, RULES_KEY);

    // 5. delete builtin rules
    delete $.cache.builtin;
    $.info('Migration complete!');

    function migrateDisplayName(item) {
        const displayName = item['display-name'];
        if (displayName) {
            item.displayName = displayName;
            delete item['display-name'];
        }
    }

    function migrateProcesses(item) {
        const processes = item.process;
        if (!processes || processes.length === 0) return;
        const newProcesses = [];
        const quickSettingOperator = {
            type: 'Quick Setting Operator',
            args: {
                udp: 'DEFAULT',
                tfo: 'DEFAULT',
                scert: 'DEFAULT',
                'vmess aead': 'DEFAULT',
                useless: 'DEFAULT',
            },
        };
        for (const p of processes) {
            if (!p.type) continue;
            if (p.type === 'Useless Filter') {
                quickSettingOperator.args.useless = 'ENABLED';
            } else if (p.type === 'Set Property Operator') {
                const { key, value } = p.args;
                switch (key) {
                    case 'udp':
                        quickSettingOperator.args.udp = value
                            ? 'ENABLED'
                            : 'DISABLED';
                        break;
                    case 'tfo':
                        quickSettingOperator.args.tfo = value
                            ? 'ENABLED'
                            : 'DISABLED';
                        break;
                    case 'skip-cert-verify':
                        quickSettingOperator.args.scert = value
                            ? 'ENABLED'
                            : 'DISABLED';
                        break;
                    case 'aead':
                        quickSettingOperator.args['vmess aead'] = value
                            ? 'ENABLED'
                            : 'DISABLED';
                        break;
                }
            } else if (p.type.indexOf('Keyword') !== -1) {
                // drop keyword operators and keyword filters
            } else if (p.type === 'Flag Operator') {
                // set default args
                const add = typeof p.args === 'undefined' ? true : p.args;
                p.args = {
                    mode: add ? 'add' : 'remove',
                };
                newProcesses.push(p);
            } else {
                newProcesses.push(p);
            }
        }
        newProcesses.unshift(quickSettingOperator);
        item.process = newProcesses;
    }
}
