export function normalizeXhttpScalarUpperBound(value) {
    if (typeof value !== 'string' && typeof value !== 'number') {
        return undefined;
    }

    // Mirror Mihomo's ParseRange/GetNormalizedSc* behavior: accept explicit
    // positive signs, leading zeros, and ascending ranges, but reject
    // zero-valued finals because sc-* values must resolve to > 0.
    const parseUnsignedIntegerToken = (token) => {
        const normalizedToken = token.trim();
        if (!/^\+?\d+$/.test(normalizedToken)) {
            return undefined;
        }

        const parsedInteger = parseInt(normalizedToken, 10);
        return Number.isSafeInteger(parsedInteger) ? parsedInteger : undefined;
    };

    const normalizedValue = `${value}`.trim();
    const rangeParts = normalizedValue.split('-');
    if (rangeParts.length === 1) {
        const normalizedInteger = parseUnsignedIntegerToken(rangeParts[0]);
        return normalizedInteger > 0 ? normalizedInteger : undefined;
    }

    if (rangeParts.length !== 2) {
        return undefined;
    }

    const lowerBound = parseUnsignedIntegerToken(rangeParts[0]);
    const upperBound = parseUnsignedIntegerToken(rangeParts[1]);
    if (lowerBound == null || upperBound == null) {
        return undefined;
    }

    return upperBound > 0 && upperBound >= lowerBound ? upperBound : undefined;
}
