import {EventEmitter} from 'node:events';
import {chunk_from_point} from './location.js';
import {Table, MapList} from "./storage.js";
import {Plant} from "./plant.js";
import {Logger} from "../util/logger.js";

/**
 * Fires if chunk has no plants
 * @fires Chunk#empty_chunk
 * @event Chunk#seed_planted
 * @event Chunk#weed_removed
 * @event Chunk#plant_collected
 * @event Chunk#plant_dead
 */
export class Chunk extends EventEmitter {
    /*** @type {Table<Plant>}*/
    #plants = new Table();
    /*** @type {MapList<number, Plant>}*/
    #queue = new MapList();
    /*** @type {Logger}*/
    #logger;

    constructor(x, y) {
        super();
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
     * @event Chunk#empty_chunk
     * @type {Chunk}
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
                this.#logger.post_metric('next_schedule', {
                    chunk: {i: this.i, j: this.j},
                    diff,
                });
            } else {
                this.#logger.error(`Diff is less than 0 ${diff} mls`);
                this.#logger.post_metric('schedule_wrong_timer', {
                    chunk: {i: this.i, j: this.j},
                    diff,
                });
            }
        } else {
            this.#logger.log(`no plants chunk`);
            this.#logger.post_metric('empty_chunk', {
                chunk: {i: this.i, j: this.j},
            });

            this.emit('empty_chunk', this);
        }
    }

    /**
     * @param plant {Plant}
     */
    #add(plant) {
        const [i, j] = chunk_from_point(plant.x, plant.y);
        if (this.i !== i || this.j !== j) {
            this.#logger.log(plant.toString(), 'is not assigned here');
            this.#logger.post_metric('add_plant_to_wrong_chunk', {
                chunk: {i: this.i, j: this.j},
                desired_pos: {i, j, x: plant.x, y: plant.y},
            });
            return false;
        }

        if (this.#plants.has(plant.x, plant.y)) {
            this.#logger.log(plant.toString(), 'is already taken');
            this.#logger.post_metric('add_plant_to_wrong_chunk', {
                pos: {i: this.i, j: this.j, x: plant.x, y: plant.y},
            });
            return false;
        }

        this.#logger.debug('adding', plant.toString());
        this.#plants.set(plant.x, plant.y, plant);
        this.#logger.post_metric('add_plant', {
            pos: {i: this.i, j: this.j, x: plant.x, y: plant.y},
            seed: plant.seed.name,
        });

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

        this.#logger.post_metric('init', {
            chunk: {i: this.i, j: this.j},
            plants: plants.length,
        });

        this.#schedule();
        timer.stop();
    }

    /**
     * Perform plant seed action
     * @param seed {Seed}
     * @param x {number}
     * @param y {number}
     * @returns {boolean}
     *
     * @event Chunk#seed_planted
     * @type {{seed: Seed, x: number, y: number}}
     */
    plant_seed(seed, x, y) {
        const plant = new Plant(x, y, seed);
        if (!this.#add(plant)) return false;

        this.#schedule();
        this.emit('seed_planted', {seed, x, y});
        return true;
    }

    /**
     * Interact with flower. Neither collect or remove weed.
     *
     * @param x {number}
     * @param y {number}
     * @return {null | [] | [number, Seed]}
     *
     * @event Chunk#weed_removed
     * @type {{plant: Plant}}
     *
     * @event Chunk#plant_collected
     * @type {{plant: Plant}}
     */
    interact(x, y) {
        const plant = this.#plants.get(x, y);
        this.#logger.post_metric('interact', {
            pos: {i: this.i, j: this.j, x, y},
        });

        // remove weed from plant
        if (plant?.damaged) {
            plant.damaged = false;
            this.#logger.debug('remove weed from', plant.toString());
            this.#logger.post_metric('remove_weed', {
                pos: {x, y, i: this.i, j: this.j},
            });
            this.emit('weed_removed', {plant});
            return [];
        }

        if (plant?.is_finished) {
            const amount = plant.seed.random_drop();
            this.#plants.remove(x, y);
            this.#logger.debug(plant, 'dropped', amount, 'seed');
            this.#logger.post_metric('collect_plant', {
                pos: {i: this.i, j: this.j, x, y},
                amount,
                seed: plant.seed.name,
            });
            this.emit('plant_collected', {plant});
            return [amount, plant.seed];
        }

        const [i, j] = chunk_from_point(x, y);
        this.#logger.log(`No plant here: c[${i}:${j}]p[${x}:${y}]`);
        this.#logger.post_metric('interact_out_of_chunk', {
            chunk: {i: this.i, j: this.j},
            wrong_pos: {x, y, i, j},
        });
    }

    /**
     * Gets all chunk data
     * @returns {Plant[]}
     */
    get_data() {
        return Array.from(this.#plants.get_all());
    }

    /**
     * Executing plant growth
     * @event Chunk#plant_dead
     * @type {{plant: Plant}}
     */
    #tick() {
        const timer = this.#logger.time_start('tick');
        const now = Date.now();

        for (let key of this.#queue.keys().filter(x => x <= now)) {

            for (let plant of this.#queue.get(key)) {
                switch (plant.tick()) {
                    case true:
                        this.#logger.debug(plant.toString(), 'finished grow');
                        this.#logger.post_metric('plant_fully_grown', {
                            pos: {i: this.i, j: this.j, x: plant.x, y: plant.y},
                            seed: plant.seed.name,
                        });
                        break;

                    case false:
                        this.#logger.debug(plant.toString(), 'is dead, remove');
                        this.#logger.post_metric('plant_dead', {
                            pos: {i: this.i, j: this.j, x: plant.x, y: plant.y},
                            seed: plant.seed.name,
                        });
                        this.#plants.remove(plant.x, plant.y);
                        this.emit('plant_dead', {plant});
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