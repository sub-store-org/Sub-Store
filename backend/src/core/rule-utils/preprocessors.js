function HTML() {
    const name = 'HTML';
    const test = (raw) => /^<!DOCTYPE html>/.test(raw);
    // simply discard HTML
    const parse = () => '';
    return { name, test, parse };
}

function ClashProvider() {
    const name = 'Clash Provider';
    const test = (raw) => raw.indexOf('payload:') === 0;
    const parse = (raw) => {
        return raw.replace('payload:', '').replace(/^\s*-\s*/gm, '');
    };
    return { name, test, parse };
}

export default [HTML(), ClashProvider()];
