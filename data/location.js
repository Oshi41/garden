export let chunk_size = 1000;

/**
 * uniq hash for same cords
 * @param x {number}
 * @param y {number}
 * @returns {number}
 */
export function point_hash(x, y) {
    return ((x + y) * (x + y + 1) / 2) + y;
}

/**
 * Gets chunk point from coordinate
 * @param x {number}
 * @param y {number}
 * @returns {[number, number]}
 */
export function chunk_from_point(x, y) {

    if (x < 0)
        x -= chunk_size;

    if (y < 0)
        y -= chunk_size;

    x -= (x % chunk_size);
    y -= (y % chunk_size);

    x /= chunk_size;
    y /= chunk_size;

    return [x, y];
}

/**
 * Distance between points
 * @param from { {x: number, y: number} }
 * @param to { {x: number, y: number} }
 */
export function distance(from, to) {
    return Math.hypot(from.x - to.x, from.y - to.y);
}

export const t = {
    set chunk_size(val) {
        chunk_size = val;
    }
}