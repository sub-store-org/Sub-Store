function AND(...args) {
    return args.reduce((a, b) => a.map((c, i) => b[i] && c));
}

function OR(...args) {
    return args.reduce((a, b) => a.map((c, i) => b[i] || c));
}

function NOT(array) {
    return array.map((c) => !c);
}

function FULL(length, bool) {
    return [...Array(length).keys()].map(() => bool);
}

export { AND, OR, NOT, FULL };
