import {chunk_from_point} from './location.js';
import {Table, MapList} from "./storage.js";
import {Plant} from "./plant.js";
import {Logger} from "../logger.js";

export class Chunk {
    /*** @type {Table<Plant>}*/
    #plants = new Table();
    /*** @type {MapList<number, Plant>}*/
    #queue = new MapList();
    /*** @type {Logger}*/
    #logger;

    constructor(x, y) {
        const [i, j] = chunk_from_point(x, y);
        this.i = i;
        this.j = j;
        this.#logger = new Logger(`[CHUNK ${this.i}:${this.j}]`);

        if (process?.env?.NODE_TEST_CONTEXT) {
            this.t = {
                /*** @type {Table<Plant>}*/
                plants: this.#plants,
                /*** @type {MapList<number, Plant>}*/
                queue: this.#queue,
            };
        }
    }

    /**
     * Scheduling next update
     */
    #schedule() {
        clearTimeout(this.interval);
        this.interval = null;
        const now = Date.now();

        const times = this.#queue.keys().sort();

        if (times.length) {
            const next = times[0];
            const diff = next - now;
            if (diff > 0) {
                this.interval = setTimeout(this.#tick.bind(this), diff);
                this.#logger.log(`Next tick after ${diff} mls`);
            } else {
                this.#logger.error(`Diff is less than 0 ${diff} mls`);
            }
        } else {
            this.#logger.log(`no plants chunk`);
        }
    }

    /**
     * @param plant {Plant}
     */
    #add(plant) {
        const [i, j] = chunk_from_point(plant.x, plant.y);
        if (this.i !== i || this.j !== j) {
            this.#logger.log(plant.toString(), 'is not assigned here');
            return false;
        }

        if (this.#plants.has(plant.x, plant.y)) {
            this.#logger.log(plant.toString(), 'is already taken');
            return false;
        }

        this.#logger.debug('adding', plant.toString());
        this.#plants.set(plant.x, plant.y, plant);

        if (!plant.is_finished && !plant.is_dead) {
            this.#logger.debug('scheduling', plant.toString());
            this.#queue.set(plant.last_check.valueOf() + plant.seed.per_stage, plant);
        }

        return true;
    }

    /**
     * load all plants
     * @param plants {Plant[]}
     */
    init(plants) {
        const timer = this.#logger.time_start('init');

        for (let plant of plants) {
            this.#add(plant);
        }

        this.#schedule();
        timer.stop();
    }

    /**
     *
     * @param seed {Seed}
     * @param x {number}
     * @param y {number}
     * @returns {boolean}
     */
    plant_seed(seed, x, y) {
        const plant = new Plant(x, y, seed);
        if (!this.#add(plant)) return false;

        this.#schedule();
        return true;
    }

    /**
     * Interact with flower. Neither collect or remove weed.
     *
     * @param x {number}
     * @param y {number}
     * @return {null | [] | [number, Seed]}
     */
    interact(x, y) {
        const plant = this.#plants.get(x, y);

        // remove weed from plant
        if (plant?.damaged) {
            plant.damaged = false;
            this.#logger.debug('remove weed from', plant.toString());
            return [];
        }

        if (plant?.is_finished) {
            const amount = plant.seed.random_drop();
            this.#plants.remove(x, y);
            this.#logger.debug(plant, 'dropped', amount, 'seed');
            return [amount, plant.seed];
        }

        const [i, j] = chunk_from_point(x, y);
        this.#logger.log(`No plant here: c[${i}:${j}]p[${x}:${y}]`);
    }

    /**
     * Executing plant growth
     */
    #tick() {
        const timer = this.#logger.time_start('tick');
        const now = Date.now();

        for (let key of this.#queue.keys().filter(x => x <= now)) {

            for (let plant of this.#queue.get(key)) {
                switch (plant.tick()) {
                    case true:
                        this.#logger.debug(plant.toString(), 'finished grow');
                        break;

                    case false:
                        this.#logger.debug(plant.toString(), 'is dead, remove');
                        this.#plants.remove(plant.x, plant.y);
                        break;

                    default:
                        this.#logger.debug('scheduling', plant.toString());
                        this.#queue.set(now + plant.seed.per_stage, plant);
                        break
                }
            }

            this.#queue.remove_key(key);
        }

        this.#schedule();
        timer.stop();
    }
}