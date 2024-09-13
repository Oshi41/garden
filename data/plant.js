import {Seed, seed_from_id} from "./seed.js";
import {chunk_from_point} from './location.js';

export class Plant {
    #x;
    #y;
    #seed;

    /**
     * @param x {number}
     * @param y {number}
     * @param type {Seed | number}
     * @param stage {number}
     * @param damaged {boolean}
     * @param last_check {Date}
     */
    constructor(x, y, type, stage = 0, damaged = false, last_check = new Date()) {
        this.#x = x;
        this.#y = y;
        this.#seed = type instanceof Seed
            ? type
            : seed_from_id(type);

        /**
         * Current stage
         * @type {number}
         */
        this.stage = stage;

        /**
         * Is plant damaged
         * @type {boolean}
         */
        this.damaged = damaged;

        /**
         * Last plant check
         * @type {Date}
         */
        this.last_check = last_check;
    }

    /**
     * X position
     * @returns {number}
     */
    get x() {
        return this.#x;
    }

    /**
     * Y position
     * @returns {number}
     */
    get y() {
        return this.#y;
    }

    /**
     * Growing seed
     * @returns {Seed}
     */
    get seed() {
        return this.#seed
    }

    /**
     * Should delete plant after decay
     * @returns {boolean}
     */
    get is_dead() {
        return this.stage <= -this.seed.stages;
    }

    /**
     * Is grow fully grown
     * @returns {boolean}
     */
    get is_finished() {
        return this.stage >= this.seed.stages;
    }

    /**
     * Increment plant state.
     * @returns {boolean} - true - fully grown, false - should remove plant, null otherwise
     */
    tick() {
        this.last_check = new Date();

        if (this.damaged)
            this.stage++;

        if (this.damaged || Math.random() < this.seed.fragility) {
            this.damaged = true;
            this.stage--;
        }

        if (this.is_dead) return false;
        if (this.is_finished) return true;
    }

    toString() {
        const [i, j] = chunk_from_point(this.x, this.y);
        let str = `c[${i}:${j}]p[${this.x}:${this.y}] ${this.seed?.name || 'unknown plant'}`;
        if (this.is_dead)
            str += ' (is_dead)';
        if (this.is_finished)
            str += ' (is_finished)';
        return str;
    }
}