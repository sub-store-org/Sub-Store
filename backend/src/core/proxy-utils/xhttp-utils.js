function parseNormalizedXhttpRangeBounds(
    value,
    { allowZeroUpperBound = true } = {},
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
    if (rangeParts.length === 1) {
        const normalizedInteger = parseUnsignedIntegerToken(rangeParts[0]);
        const minimumAllowedValue = allowZeroUpperBound ? 0 : 1;
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

    const minimumAllowedUpperBound = allowZeroUpperBound ? 0 : 1;
    return upperBound >= minimumAllowedUpperBound && upperBound >= lowerBound
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

export function normalizeXhttpScalarUpperBound(value) {
    // IMPORTANT: the legacy-client compatibility reason for collapsing ranges
    // to an upper bound specifically applies to sc-max-each-post-bytes.
    // Mihomo first shipped sc-max-each-post-bytes as an int-only field, then
    // only later added true range support, so emitting `lower-upper` here can
    // still break older clients that predate that change. Once the new
    // official Mihomo stable release with ranged sc-max-each-post-bytes is
    // broadly deployed, switch that field back to preserving full ranges and
    // remove the upper-bound compatibility logic tied to it.
    const normalizedBounds = parseNormalizedXhttpPositiveRangeBounds(value);
    return normalizedBounds?.upperBound;
}

export function normalizeXhttpPositiveRange(value) {
    // IMPORTANT: unlike sc-max-each-post-bytes, sc-min-posts-interval-ms does
    // not need an old-client compatibility shim. Mihomo introduced
    // sc-min-posts-interval-ms with range semantics from day one, so we should
    // keep exporting its full normalized range form instead of collapsing it.
    const normalizedBounds = parseNormalizedXhttpPositiveRangeBounds(value);
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
