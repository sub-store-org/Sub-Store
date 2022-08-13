const fs = require('fs');
const packageJson = require('./package.json');

function main() {
    packageJson.name = 'my-sub-store';
    const path = __dirname + '/dist/package.json';
    const content = JSON.stringify(packageJson, null, 2);
    fs.writeFileSync(path, content);
}

main();
