export const chunk_size = 1000;

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
    return [
        Math.floor(x - (x % chunk_size) / chunk_size),
        Math.floor(y - (y % chunk_size) / chunk_size),
    ];
}

/**
 * Distance between points
 * @param from { {x: number, y: number} }
 * @param to { {x: number, y: number} }
 */
export function distance(from, to) {
    return Math.hypot(from.x - to.x, from.y - to.y);
}