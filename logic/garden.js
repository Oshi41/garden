import cluster from 'cluster';
import {Scheduler} from "../util/scheduler.js";
import {Logger} from "../util/logger.js";
import Database from '@seald-io/nedb';
import {seed_from_id} from "../data/seed.js";
import {arr, clamp, distinct, is_in_test, pick, pretty_print} from "../util/_.js";

/**
 * @typedef {Object} PlantData
 * @property {number} x
 * @property {number} y
 * @property {number} seed
 * @property {number} stage
 * @property {boolean} dmg
 * @property {number} last
 */

/*** @type {(keyof PlantData)[]}*/
const mandatory_fields = ['x', 'y', 'seed'];
/*** @type {(keyof PlantData)[]}*/
const int_fields = [...mandatory_fields, 'stage'];

/*** @typedef {Pick<Garden, 'has_plant' | 'add_plants' | 'interact' | 'count'>} IGarden*/

export class Garden {
    /** @type {Database<PlantData>}*/
    #db;

    #logger = new Logger(`Garden [${cluster.worker?.id || 'master'}]`);

    #scheduler = new Scheduler(this.#logger.header, this.#tick.bind(this));

    /**
     * @param opts {Database.DataStoreOptions}
     */
    constructor(opts) {
        this.#db = new Database(opts);

        process.on('beforeExit', async () => {
            // forcing to save file
            await this.#db.compactDatafileAsync();
        });

        if (is_in_test()) {
            this.t = {
                /**
                 * @param {Partial<PlantData>} q
                 * @returns {Promise<PlantData[]>}
                 */
                find: async (q) => {
                    try {
                        return await this.#db.findAsync(q);
                    } catch (e) {
                        this.#logger.error(`Error during findAsync(${pretty_print(q)})`, e);
                        throw e;
                    }
                },
                scheduler: this.#scheduler,
            }
        }
    }

    /**
     * initialize worker
     * @returns {Promise<void>}
     */
    async init() {
        await this.#db.ensureIndexAsync({fieldName: ['x', 'y'], unique: true});
        await this.#db.loadDatabaseAsync();

        await this.#tick();
    }

    /**
     * Checking if has plant here
     * @param x {number}
     * @param y {number}
     * @returns {Promise<boolean>}
     */
    async has_plant({x, y}) {
        if ([x, y].some(i => !Number.isInteger(i))) return false;

        const count = await this.#db.countAsync({x, y});
        return count > 0;
    }

    /**
     * Adding new plant(s) to garden
     * @param plants {PlantData | PlantData[]}
     * @returns {Promise<{x: number, y: number}[]>}
     */
    async add_plants(plants) {
        const timer = this.#logger.time_start('add_plants');
        plants = arr(plants);

        const validated = await Promise.all(plants.map(x => this.#validate_plant(x)));
        const docs = await this.#db.insertAsync(validated.map(x => x.success).filter(x => !!x));

        this.#logger.debug(`${docs.length} plants added:${docs.map(x => pick(x, 'x', 'y', 'seed'))
            .map(x => Object.assign(x, {seed: seed_from_id(x.seed).name}))
            .map(x => pretty_print(x))
            .join(', ')}`);

        const result = this.#schedule_plants(docs).map(doc => pick(doc, 'x', 'y'));

        timer.stop();
        return result;
    }

    /**
     * interacting with plant
     * @param x {number}
     * @param y {number}
     * @return {Promise<false | {weed_removed: true} | {seed: number, amount: number}>}
     * - false if no plant on cords
     * - {weed_removed: true} if weed collected
     * - {seed: number, amount: number} if plant collected
     */
    async interact({x, y}) {
        const pos = {x, y};
        const plant = await this.#db.findOneAsync(pos);
        if (!plant) {
            this.#logger.debug(`No plant on this location: [${x}:${y}]`);
            return false;
        }

        if (plant.dmg) {
            await this.#db.updateAsync(pos, {$set: {dmg: false}}, {upsert: false, multi: false});
            this.#logger.debug(`Weed removed: [${x}:${y}]`);
            return {weed_removed: true};
        }

        const seed = seed_from_id(plant.seed);
        if (plant.stage >= seed.stages) {
            const result = {seed: seed.index, amount: seed.random_drop()};
            this.#logger.debug(`Plant collected: [${x}:${y}], "${seed.name}"=${result.amount}`);
            await this.#db.removeAsync(pos, {multi: false});
            return result;
        }

        return false;
    }

    /**
     * Validates plant and return validated obj
     * @throws {Error} if checks failed
     * @param plant {Partial<PlantData>}
     * @returns {Promise<Partial<{success: PlantData, error: Error}>>}
     */
    async #validate_plant(plant) {
        if (mandatory_fields.some(x => !Number.isInteger(plant[x]))) {
            return {
                error: new Error('mandatory fields are missing:'
                    + mandatory_fields.reduce((r, key) => Object.assign(r, {[key]: plant[key]})))
            };
        }

        if (await this.has_plant(plant)) {
            return {error: new Error(`plant exist here [${plant.x}:${plant.y}]`)};
        }

        if (int_fields.some(key => !Number.isInteger(plant[key] || 0))) {
            return {
                error: new Error('int field validation failed:'
                    + int_fields.reduce((r, key) => Object.assign(r, {[key]: plant[key]})))
            };
        }

        const seed = seed_from_id(plant.seed);
        if (!seed) {
            return {error: new Error(`seed is missing: ${plant.seed}`)};
        }

        plant.stage ||= 0;
        plant.last ||= Date.now();
        plant.dmg = !!plant.dmg;

        plant.stage = clamp(-seed.stages, plant.stage, seed.stages);

        return {success: plant};
    }

    /**
     * Plants count
     * @returns {Nedb.Cursor<number>}
     */
    count() {
        return this.#db.countAsync({});
    }

    /**
     * Performs plant growing tick
     * @returns {Promise<void>}
     */
    async #tick() {
        const timer = this.#logger.time_start('#tick');
        this.#logger.debug("TICK STARTED");

        const now = Date.now();
        const times = await this.#db.findAsync({last: {$lte: now}}, {last: 1, seed: 1}).sort({last: 1});
        const q = distinct(times.filter(x => x.last + seed_from_id(x.seed).per_stage <= now)
            .map(x => x.last));

        const plants = await this.#db.findAsync({last: {$in: q}});
        const dead = [], updated = [];
        for (let plant of plants) {
            const seed = seed_from_id(plant.seed);
            const max = seed.stages;
            if (max <= plant.stage) continue;

            plant.last = now;

            if (!plant.dmg)
                plant.stage++;

            if (plant.dmg || Math.random() < seed.fragility) {
                plant.dmg = true;
                plant.stage--;
            }

            if (plant.stage <= -seed.stages) {
                dead.push(plant);

                this.#logger.debug(`Deleted`, pretty_print(Object.assign(
                    pick(plant, 'x', 'y', 'stage'),
                    {seed: seed_from_id(plant.seed).name}
                )));
            } else {
                updated.push(plant);

                this.#logger.debug(`Updated`, pretty_print(Object.assign(
                    pick(plant, 'x', 'y', 'stage'),
                    {seed: seed_from_id(plant.seed).name}
                )));
            }
        }

        if (dead.length) {
            this.#logger.debug(`Deleting [${dead.length}] dead plants`);
        }
        if (updated?.length) {
            this.#logger.debug(`Updating [${updated.length}] plants`);
        }

        const to_delete = [...dead, ...updated].map(x => x._id);

        // remove all documents
        await this.#db.removeAsync({_id: {$in: to_delete}}, {multi: true});

        // inserting new changed docs and schedule updates
        this.#schedule_plants(await this.#db.insertAsync(updated));

        timer.stop();
    }

    /**
     * @template T {last: number, seed: number}
     * @param plants {T[]}
     * @return {T[]}
     */
    #schedule_plants(plants) {
        for (let {last, seed, stage} of plants) {
            const seed_obj = seed_from_id(seed);
            // ignoring full-grown seeds
            if (Math.abs(stage) < seed_obj.stages) {
                const next = last + seed_obj.per_stage;
                this.#scheduler.add(next);
            }
        }
        return plants;
    }
}