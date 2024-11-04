export function findByName(list, name, field = 'name') {
    return list.find((item) => item[field] === name);
}

export function findIndexByName(list, name, field = 'name') {
    return list.findIndex((item) => item[field] === name);
}

export function deleteByName(list, name, field = 'name') {
    const idx = findIndexByName(list, name, field);
    list.splice(idx, 1);
}

export function updateByName(list, name, newItem, field = 'name') {
    const idx = findIndexByName(list, name, field);
    list[idx] = newItem;
}
