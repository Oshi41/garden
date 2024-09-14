import {distance} from "./location.js";
import {Logger} from "../logger.js";
import {seed_from_id} from "./seed.js";

/**
 * @template T
 */
class Recorded {
    #last;
    #current;
    #validate;

    /**
     *
     * @param val {T} initial value
     * @param validate {(old: T, updated: T, diff: number) => boolean} validation function accepting new value and time diff
     */
    constructor(val, validate) {
        this.#validate = validate;
        this.#last = Date.now();
        this.#current = val;
    }

    /**
     * Updating recorded state with new value
     * @param val {T}
     * @return {boolean}
     */
    update(val) {
        const now = Date.now();
        const time_diff = now - this.#last;
        this.#last = now;

        if (!this.#validate(this.#current, val, time_diff)) {
            return false;
        }

        this.#current = val;
        return true;
    }

    /**
     * Returns current valid value
     * @returns {T}
     */
    value() {
        return this.#current;
    }
}

export class Player {
    /*** @type {string}*/
    #id;
    /*** @type {Logger}*/
    #logger;
    /*** @type {Recorded<{x: number, y: number}>}*/
    #pos;
    /*** @type {Recorded<number>}*/
    #interact;
    /**
     * player inventory
     * @type {Map<number, number>}
     */
    #inventory = new Map();

    /**
     *
     * @param id {string}
     * @param x {number}
     * @param y {number}
     * @param seeds {[number, number][]}
     */
    constructor(id, x, y, seeds = []) {
        this.#id = id;
        this.#logger = new Logger(`Player[${id}]`);
        this.#pos = new Recorded({x, y}, (old, updated, diff) => {
            const dist = distance(old, updated);
            const speed = dist / (diff / 1000);
            if (speed <= this.max_speed) return true;

            this.#logger.debug('player moved too fast, attempt to move to ', dist, 'metres');
            this.#logger.post_metric('player_too_fast', {
                name: this.id,
                distance: dist,
                diff,
                speed,
            });
            return false;
        });
        this.#interact = new Recorded(Date.now(), (old, updated, diff) => {
            if (diff >= this.interaction_timeout) return true;

            this.#logger.debug('player acts too fast', diff);
            this.#logger.post_metric('player_spam', {
                name: this.id,
                diff,
            });
            return false;
        });

        for (let [type, amount] of seeds) {
            if (amount > 0) {
                const seed = seed_from_id(type);
                if (seed) {
                    this.#inventory.set(type, amount);
                } else {
                    this.#logger.log('unknown seed', type);
                    this.#logger.post_metric('wrong_seed_type', {
                        id: this.id,
                        source: 'player_inventory',
                    });
                }
            }
        }

        if (process?.env?.NODE_TEST_CONTEXT) {
            this.t = {
                /** @type {Map<number, number>} */
                inventory: this.#inventory,
            };
        }
    }

    /**
     * Player interaction timeout
     * @returns {number}
     */
    get interaction_timeout() {
        return 1000;
    }

    /**
     * Max player speed
     * @returns {number}
     */
    get max_speed() {
        return 3;
    }

    /**
     * Gets player view range radius
     * @returns {number}
     */
    get view_range() {
        return 20;
    }

    /**
     * Returns reach limit for player
     * @returns {number}
     */
    get reach_limit() {
        return 1.5;
    }

    /**
     * Uniq player ID
     * @returns {string}
     */
    get id() {
        return this.#id;
    }

    /**
     * Current player position
     * @returns {{x: number, y: number}}
     */
    get cords() {
        return this.#pos.value();
    }

    /**
     * Updating player position
     * @param val {x:number, y: number}
     */
    set cords(val) {
        if (!this.#pos.update(val)) return;

        this.#logger.debug('player pos updated', this.cords);
        this.#logger.post_metric('player_moved', {
            name: this.id,
            cords: this.cords,
        });
    }

    /**
     * Common interaction check.
     * Filter out spam requests (sent too often)
     * Filter out interactions player cannot reach physically
     * @param x {number}
     * @param y {number}
     * @returns {boolean}
     */
    #check_interaction(x, y) {
        // prevent interaction spam
        if (!this.#interact.update(Date.now())) return false;
        if (distance(this.cords, {x, y}) > this.reach_limit) {
            const msg = {
                id: this.id,
                pos: {x, y},
                distance: distance(this.cords, {x, y}),
            };
            this.#logger.debug('player cannot reach this position', msg);
            this.#logger.post_metric('player_reach_error', msg);
            return false;
        }
        return true;
    }

    /**
     * Performs plant action
     * @param seed {Seed}
     * @param chunk {Chunk}
     * @param x {number}
     * @param y {number}
     * @return {boolean}
     */
    plant(seed, chunk, x, y) {
        if (!this.#check_interaction(x, y)) return false;

        // checking amount
        const amount = this.#inventory.get(seed?.index);
        if (!amount) {
            this.#logger.debug('Player do not have such seed:', seed.name);
            this.#logger.post_metric('player_do_not_have_seed', {
                pos: {x, y,},
                seed: seed.name,
            });
            return false;
        }

        // checking if can plant
        if (!chunk.plant_seed(seed, x, y)) return false;

        // remove from inventory
        this.#inventory.set(seed?.index, amount - 1);
        return true;
    }

    /**
     * Perform interaction (collect or remove weed)
     * @param chunk {Chunk}
     * @param x {number}
     * @param y {number}
     */
    interact(chunk, x, y) {
        if (!this.#check_interaction(x, y)) return false;

        const result = chunk.interact(x, y);
        if (!result) {
            this.#logger.debug('wrong interaction', x, y);
            this.#logger.post_metric('player_wrong_interaction', {
                id: this.id,
                pos: {x, y},
            });
            return false;
        } else if (!result.length) {
            this.#logger.debug('weed removed', x, y);
            this.#logger.post_metric('player_removed_weed', {
                id: this.id,
                pos: {x, y},
            });
            return true;
        } else {
            const [drop, seed] = result;
            const amount = drop + (this.#inventory.get(seed.index) || 0);
            this.#inventory.set(seed.index, amount);

            this.#logger.debug('collected plant', x, y, 'get', drop, 'seeds');
            this.#logger.post_metric('player_collected_weed', {
                id: this.id,
                pos: {x, y},
                seed: seed.name,
                amount: drop,
            });

            return true;
        }
    }
}