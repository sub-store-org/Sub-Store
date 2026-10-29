const FORBIDDEN_FIELDS = ['__proto__', 'constructor', 'prototype'];

function isSafeField(field) {
    return typeof field === 'string' && !FORBIDDEN_FIELDS.includes(field);
}

export function findByName(list, name, field = 'name') {
    if (!isSafeField(field)) return undefined;
    return list.find((item) => Object.prototype.hasOwnProperty.call(item, field) && item[field] === name);
}

export function findIndexByName(list, name, field = 'name') {
    if (!isSafeField(field)) return -1;
    return list.findIndex((item) => Object.prototype.hasOwnProperty.call(item, field) && item[field] === name);
}

export function deleteByName(list, name, field = 'name') {
    const idx = findIndexByName(list, name, field);
    list.splice(idx, 1);
}

export function updateByName(list, name, newItem, field = 'name') {
    const idx = findIndexByName(list, name, field);
    list[idx] = newItem;
}

export function insertByPosition(list, item, position = 'bottom') {
    if (position === 'top') {
        list.unshift(item);
        return;
    }

    list.push(item);
}
