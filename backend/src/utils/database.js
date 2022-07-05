export function findByName(list, name) {
    return list.find((item) => item.name === name);
}

export function findIndexByName(list, name) {
    return list.findIndex((item) => item.name === name);
}

export function deleteByName(list, name) {
    const idx = findIndexByName(list, name);
    list.splice(idx, 1);
}

export function updateByName(list, name, newItem) {
    const idx = findIndexByName(list, name);
    list[idx] = newItem;
}
