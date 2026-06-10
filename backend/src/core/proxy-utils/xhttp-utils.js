function parseNormalizedXhttpRangeBounds(
    value,
    { allowZeroLowerBound = true, allowZeroUpperBound = true } = {},
) {
    if (typeof value !== 'string' && typeof value !== 'number') {
        return undefined;
    }

    // Mirror Mihomo's ParseRange behavior: accept explicit positive signs,
    // leading zeros, and ascending ranges. We also compact whitespace so the
    // emitted value stays compatible with Xray's Int32Range string parser,
    // which does not trim around the internal `-`.
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
    const minimumAllowedLowerBound = allowZeroLowerBound ? 0 : 1;
    const minimumAllowedUpperBound = allowZeroUpperBound ? 0 : 1;
    if (rangeParts.length === 1) {
        const normalizedInteger = parseUnsignedIntegerToken(rangeParts[0]);
        const minimumAllowedValue = Math.max(
            minimumAllowedLowerBound,
            minimumAllowedUpperBound,
        );
        return normalizedInteger >= minimumAllowedValue
            ? {
                  lowerBound: normalizedInteger,
                  upperBound: normalizedInteger,
              }
            : undefined;
    }

    if (rangeParts.length !== 2) {
        return undefined;
    }

    const lowerBound = parseUnsignedIntegerToken(rangeParts[0]);
    const upperBound = parseUnsignedIntegerToken(rangeParts[1]);
    if (lowerBound == null || upperBound == null) {
        return undefined;
    }

    return lowerBound >= minimumAllowedLowerBound &&
        upperBound >= minimumAllowedUpperBound &&
        upperBound >= lowerBound
        ? {
              lowerBound,
              upperBound,
          }
        : undefined;
}

function parseNormalizedXhttpPositiveRangeBounds(value) {
    return parseNormalizedXhttpRangeBounds(value, {
        allowZeroUpperBound: false,
    });
}

function parseNormalizedXhttpStrictPositiveRangeBounds(value) {
    return parseNormalizedXhttpRangeBounds(value, {
        allowZeroLowerBound: false,
        allowZeroUpperBound: false,
    });
}

export function normalizeXhttpPositiveRange(value) {
    const normalizedBounds = parseNormalizedXhttpPositiveRangeBounds(value);
    if (!normalizedBounds) {
        return undefined;
    }

    const { lowerBound, upperBound } = normalizedBounds;
    return lowerBound === upperBound ? upperBound : `${lowerBound}-${upperBound}`;
}

export function normalizeXhttpStrictPositiveRangeString(value) {
    const normalizedBounds = parseNormalizedXhttpStrictPositiveRangeBounds(value);
    if (!normalizedBounds) {
        return undefined;
    }

    const { lowerBound, upperBound } = normalizedBounds;
    return lowerBound === upperBound ? `${upperBound}` : `${lowerBound}-${upperBound}`;
}

export function normalizeXhttpStrictPositiveRangeValue(value) {
    const normalizedBounds = parseNormalizedXhttpStrictPositiveRangeBounds(value);
    if (!normalizedBounds) {
        return undefined;
    }

    const { lowerBound, upperBound } = normalizedBounds;
    return lowerBound === upperBound ? upperBound : `${lowerBound}-${upperBound}`;
}

export function normalizeXhttpNonNegativeRange(value) {
    const normalizedBounds = parseNormalizedXhttpRangeBounds(value);
    if (!normalizedBounds) {
        return undefined;
    }

    const { lowerBound, upperBound } = normalizedBounds;
    return lowerBound === upperBound ? upperBound : `${lowerBound}-${upperBound}`;
}

export function normalizeXhttpIntegerValue(
    value,
    { allowNegative = true } = {},
) {
    if (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        Number.isSafeInteger(value)
    ) {
        if (!allowNegative && value < 0) {
            return undefined;
        }
        return value;
    }

    if (typeof value !== 'string') {
        return undefined;
    }

    const normalizedValue = value.trim();
    const integerPattern = allowNegative ? /^[+-]?\d+$/ : /^\+?\d+$/;
    if (!integerPattern.test(normalizedValue)) {
        return undefined;
    }

    const parsedInteger = parseInt(normalizedValue, 10);
    if (!Number.isSafeInteger(parsedInteger)) {
        return undefined;
    }

    if (!allowNegative && parsedInteger < 0) {
        return undefined;
    }

    return parsedInteger;
}
