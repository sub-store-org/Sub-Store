export function createDynamicFunctionFromBody(paramNames, body, paramValues) {
    return new Function(...paramNames, body)(...paramValues);
}

export function getOptionalRequire() {
    return eval('typeof require !== "undefined"') ? require : undefined;
}
