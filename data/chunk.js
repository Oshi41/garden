/**
 * fast search chunk map
 * @type {Map<number, Chunk>}
 */
const chunks = new Map();
const chunk_size = 1000;

class Chunk {
    /**
     * plants based on the location
     * @type {Map<number, Plant>}*/
    plants = new Map();

    /**
     * seeds dropped to the world
     * @type {Map<number, {seed: Seed, amount: number}>}
     */
    seeds = new Map();

    /**
     * List of dirty positions (seed/plant was changed)
     * @type {[]}
     */
    dirty = [];

    /**
     *
     * @param x {number}
     * @param y {number}
     */
    constructor(x, y) {
        /**
         * bottom left corner X
         * @type {number}
         */
        this.from_x = x;

        /**
         * bottom left corner Y
         * @type {number}
         */
        this.from_y = y;

        /**
         * Top tight corner X
         * @type {number}
         */
        this.to_x = x + chunk_size;

        /**
         * Top right corner Y
         * @type {number}
         */
        this.to_y = y + chunk_size;
    }

    tick(){
        const del = [];

        for (let hash of this.plants.keys()) {
            const plant = this.plants.get(hash);
            if (!plant.about_time || plant.is_finished) continue;

            this.dirty.push(hash);
            if (!plant.increment())
                del.push(hash);
        }

        del.forEach(hash => this.remove(hash));
    }

    remove(hash) {
        const plant = this.plants.get(hash);
        if (!plant) return;

        this.plants.delete(hash);
        this.dirty.push(hash);

        const amount = plant.is_dead
            ? 0
            : plant.is_finished
                ? 1 + Math.floor(Math.random()*(plant.seed.max_result - 1))
                : 1;

        if (amount)
            this.seeds.set(hash, {seed: plant.seed, amount,});
    }
}

/**
 * @typedef {Object} Location
 * @property {number} x
 * @property {number} y
 */

/**
 *
 * @param hash1 {string | Location}
 * @param hash2 {string | Location}
 */
function distance(hash1, hash2) {
    if (typeof hash1 === 'string') {
        hash1 = cords_from_hash(hash1);
    }
    if (typeof hash2 === 'string') {
        hash2 = cords_from_hash(hash1);
    }
    return Math.sqrt(Math.pow(hash1.x - hash2.x, 2)
        + Math.pow(hash1.y - hash2.y, 2));
}

function cords_from_hash(hash) {
    const w = (Math.sqrt(8 * hash + 1) - 1) / 2;
    const t = (Math.pow(w, 2) + w) / 2;
    const y = (hash - t);
    const x = (w - y);
    return { x, y };
}

function hash_from_cords(x, y) {
    return ((x + y) * (x + y + 1) / 2) + y;
}

function chunk_hash_from_cords(x, y) {
    x = x - (x % chunk_size);
    y = y - (y % chunk_size);

    x = x / chunk_size;
    y = y / chunk_size;

    return hash_from_cords(x, y);
}

/**
 *
 * @param x {number}
 * @param y {number}
 * @returns {Chunk}
 */
export function chunk_from_cords(x, y) {
    const hash = chunk_hash_from_cords(x, y);
    let chunk = chunks.get(hash);
    if (!chunk) {
        chunk = new Chunk(x - (x % chunk_size), y - (y % chunk_size));
        chunks.set(hash, chunk);
    }
    return chunk;
}