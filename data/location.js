let chunk_size = 1000;

export function get_chunk_size() {
    return chunk_size;
}

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
        x -= get_chunk_size();

    if (y < 0)
        y -= get_chunk_size();

    x -= (x % get_chunk_size());
    y -= (y % get_chunk_size());

    x /= get_chunk_size();
    y /= get_chunk_size();

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
    set_chunk_size(val) {
        chunk_size = val;
    }
}