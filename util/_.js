/**
 *
 * @param min {number}
 * @param val {number}
 * @param max {number}
 * @returns {number}
 */
export function clamp(min, val, max) {
    if (val < min) return min;
    if (val > max) return max;
    return val;
}

/**
 * @template T
 * @param src {T}
 * @param key {keyof T}
 * @param add {number}
 * @return {boolean}
 */
export function inc(src, key, add) {
    if (!src) return false;
    if (src.hasOwnProperty(key)) {
        src[key] = +src[key] + +add;
    } else {
        src[key] = +add;
    }
    return true;
}

/**
 * picks needed props
 * @template T
 * @param src {T}
 * @param key {...(keyof T)}
 * @return {Pick<T, [...key]>}
 */
export function pick(src, ...key) {
    return key.reduce((acc, key) => Object.assign(acc, {[key]: src[key]}), {});
}

/**
 *
 * @param obj {Object}
 * @param style {'json' | 'inline'}
 * @return {string}
 */
export function pretty_print(obj, style = 'inline') {
    switch (style) {
        case "json":
            return JSON.stringify(obj, null, 2);

        case "inline":
            return `[${Object.entries(obj).map(([key, value]) => `${key}=${value}`).join(', ')}]`;

        default:
            throw new Error('unknown style: ' + style);
    }
}

/**
 * omit needed props
 * @template T
 * @param src {T}
 * @param key {...(keyof T)}
 * @return {Omit<T, [...key]>}
 */
export function omit(src, ...key) {
    Object.keys(src).filter(x => !key.includes(x))
        .reduce((acc, key) => Object.assign(acc, {[key]: src[key]}), {});
}

/**
 * @template T
 * @param src {T[]}
 * @return {T}
 */
export function random_element(src) {
    const val = Math.floor(Math.random() * src.length);
    const index = clamp(0, val, src.length - 1)
    return src[index];
}

/**
 * Creates array with start...end values
 * @param start {number}
 * @param end {number}
 * @throws {Error}
 * @returns {number[]}
 */
export function range(start, end) {
    if (start > end)
        throw new Error('start > end');

    if (start == end)
        return [start];

    if (start === 0)
        return Array.from(Array(end).keys());

    return Array.from(Array(end - start).keys()).map(x => start + x);
}

/**
 * @template T
 * @param arr {T[]}
 * @returns {T[]}
 */
export function distinct(arr) {
    return Array.from(new Set(arr));
}

/**
 * @template T
 * @param arg {T | T[]}
 * @returns {T[]}
 */
export function arr(arg = []) {
    return Array.isArray(arg) ? arg : [arg];
}

export function is_in_test() {
    if (typeof process != 'undefined') {

        if (['NODE_TEST_CONTEXT', 'MOCHA_COLORS'].some(x => process?.env?.hasOwnProperty(x)))
            return true;

        if (process.env.ENV == 'TEST')
            return true;
    }

    return false;
}

/**
 *
 * @param sb {sinon.SinonSandbox}
 */
export function fake_time(sb) {
    if (sb) {
        if (setTimeout.clock) {
            sb.clock = setTimeout.clock;
        } else {
            sb.useFakeTimers({toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']});
        }
    }
}

/**
 *
 * @template T
 * @param sb {sinon.SinonSandbox}
 * @param obj {T}
 * @param path {keyof T}
 */
export function stub_carefully(sb, obj, path) {
    if (sb && obj && path) {
        const prop = obj[path];
        return prop?.isSinonProxy
            ? prop
            : sb.stub(obj, path);
    }
}