import cluster from 'cluster';
import {Table} from "../data/storage.js";
import {Scheduler} from "../util/scheduler.js";
import {Logger} from "../util/logger.js";
import Database from '@seald-io/nedb';
import {seed_from_id} from "../data/seed.js";

/*** @type {string[]}*/
const mandatory_fields = 'x y seed'.split(' ');
const int_fields = [...mandatory_fields, 'stage'];

function clamp(min, val, max) {
    if (min < val) return min;
    if (max < val) return max;
    return val;
}

export class Garden {
    /** @type {Database<PlantDTO>}*/
    #db;

    #logger = new Logger(`Garden [${cluster.worker?.id || 'master'}]`);

    #scheduler = new Scheduler(this.#logger.header);

    /**
     * @param opts {Database.DataStoreOptions}
     */
    constructor(opts) {
        this.#db = new Database(opts);

        process.on('beforeExit', async () => {
            // forcing to save file
            await this.#db.compactDatafileAsync();
        });
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
     * plants count
     * @returns {Database.Cursor<number>}
     */
    async count() {
        return this.#db.countAsync({});
    }

    /**
     * Checking if has plant here
     * @param x {number}
     * @param y {number}
     */
    async has_plant({x, y}) {
        if ([x, y].some(i => !Number.isInteger(i))) return false;

        const count = await this.#db.countAsync({x, y});
        return count > 0;
    }

    /**
     * Adding new plant(s) to garden
     * @param plants {PlantDTO | PlantDTO[]}
     * @returns {Promise<{x: number, y: number}[]>}
     */
    async add_plants(plants) {
        const timer = this.#logger.time_start('add_plants');
        if (!Array.isArray(plants))
            plants = [plants];

        const validated = await Promise.all(plants.map(x => this.#validate_plant(x)));
        const docs = validated.map(x => x.success).filter(x => !!x);
        const result = this.#schedule_plants(await this.#db.insertAsync(docs))
            .map(doc => ({x: doc.x, y: doc.y}));

        timer.stop();
        return result;
    }

    /**
     * interacting with plant
     * @param x {number}
     * @param y {number}
     * @return {Promise<false | {damaged: false} | {seed: number, amount: number}>}
     * - false if no plant on cords
     * - {damaged: false} if weed collected
     * - {seed: number, amount: number} if plant collected
     */
    async interact({x, y}) {
        const plant = await this.#db.findOneAsync({x, y});
        if (!plant) {
            this.#logger.debug(`No plant on this location: [${x}:${y}]`);
            return false;
        }

        if (plant.dmg) {
            await this.#db.updateAsync({x, y}, {dmg: false}, {upsert: false, multi: false});
            this.#logger.debug(`Weed removed: [${x}:${y}]`);
            return {damaged: false};
        }

        const seed = seed_from_id(plant.seed);
        if (plant.stage >= seed.stages) {
            const result = {seed: seed.index, amount: seed.random_drop()};
            this.#logger.debug(`Plant collected: [${x}:${y}], "${seed.name}"=${result.amount}`);
            await this.#db.removeAsync({x, y}, {multi: false});
            return result;
        }

        return false;
    }

    /**
     * Validates plant and return validated obj
     * @throws {Error} if checks failed
     * @param plant {Partial<PlantDTO>}
     * @returns {Promise<{success: PlantDTO, error: Error}>}
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

        plant.stages ||= 0;
        plant.last ||= Date.now();
        plant.dmg = !!plant.dmg;

        plant.stages = clamp(-seed.stages, plant.stages, seed.stages);

        return {success: plant};
    }

    /**
     * Performs plant growing tick
     * @returns {Promise<void>}
     */
    async #tick() {
        const timer = this.#logger.time_start('#tick');

        const now = Date.now();
        const times = await this.#db.findAsync({}, {last: 1, seed: 1}).sort({last: 1});
        const tick_now = Array.from(new Set(times
            .filter(x => now - x.last + seed_from_id(x.seed) <= 0)
            .map(x => x.last)))
            .map(x => ({last: x}));

        const plants = await this.#db.findAsync({$or: tick_now});
        const dead = [], updated = [];
        for (let plant of plants) {
            const seed = seed_from_id(plant.seed);
            const max = seed.stages;
            if (max <= plant.stage) continue;

            plant.last = now;

            if (!plant.dmg)
                plant.stage++;

            if (!plant.dmg || Math.random() < seed.fragility) {
                plant.dmg = true;
                plant.stage--;
            }

            if (plant.stage <= seed.stages)
                dead.push(plant);
            else
                updated.push(plant);
        }

        if (dead.length) {
            this.#logger.debug(`Deleting [${dead.length}] dead plants`);
        }
        if (updated?.length) {
            this.#logger.debug(`Updating [${updated.length}] plants`);
        }

        const to_delete = [...dead, ...updated].map(x => ({x: x.x, y: x.y}));

        // remove all documents
        await this.#db.removeAsync({$or: to_delete}, {multi: true});

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
        const now = Date.now();
        new Set(plants.map(x => now - x.last + seed_from_id(x.seed))).forEach(next => {
            this.#scheduler.add(next, this.#tick.bind(this));
        });
        return plants;
    }
}