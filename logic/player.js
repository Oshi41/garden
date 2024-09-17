import Database from '@seald-io/nedb';
import {Logger} from "../util/logger.js";
import cluster from "cluster";

/**
 * @typedef {Object} PlayerDTO
 * @property {string} name
 * @property {number} x
 * @property {number} y
 * @property {Object} container
 * @property {number} last
 * @property {number} register
 */

/*** @typedef {Pick<Garden, 'has_plant' | 'add_plants' | 'interact'>} IGarden*/


export class Player {
    /** @type {Database<PlantDTO>}*/
    #db;

    #logger = new Logger(`Player[${cluster.worker?.id || 'master'}]`);

    /**
     * @param opts {Database.DataStoreOptions}
     */
    constructor(opts) {
        this.#db = new Database(opts);
        this.max_speed_per_second = 3;
        this.timeout = 200;
        this.reach_distance = 1.6;
    }

    async init() {
        await this.#db.ensureIndexAsync({fieldName: ['name'], unique: true});
        await this.#db.loadDatabaseAsync();
    }

    /**
     *
     * change pos of player
     * @param name
     * @param x
     * @param y
     * @returns {Promise<boolean>}
     */
    async set_pos(name, {x, y}) {
        // checking the interaction spam
        if (!await this.#interact(name)) return false;

        // checking if speed is appropriate
        if (Math.hypot(x, y) > this.max_speed_per_second) return false;

        // incrementing position
        return await this.#update_one(name, {$inc: {x, y}});
    }

    /**
     * Removing weed / collecting plant
     * @param player {PlayerDTO}
     * @param pos {{x: number, y: number}}
     * @param gardens {IGarden[]}
     * @returns {Promise<boolean>}
     */
    async interact(player, pos, gardens) {
        if (!await this.#interact(player.name)) return false;
        if (Math.hypot(player.x - pos.x, player.y - pos.y) > this.reach_distance) return false;

        const garden = (await Promise.all(gardens.map(async x => {
            const has_plant = await x.has_plant(pos);
            return has_plant ? x : null
        }))).find(x => !!x);

        if (!garden) {
            this.l
        }

        // const resp = await on_interact(pos);
        // if (!resp) return false;
        //
        // const {seed, amount} = resp;
        // if ([seed, amount].all(x => Number.isInteger(x))) {
        //     player.container[seed] ||= 0;
        //     player.container[seed] += amount;
        //     return true;
        // }
    }

    /**
     *
     * @param name
     * @returns {Promise<boolean>}
     */
    async #interact(name) {
        const now = Date.now();
        return await this.#update_one({name, $lte: {last: now - this.timeout}}, {last: now});
    }

    /**
     * update single player
     * @param name {string}
     * @param q {Partial<PlayerDTO>}
     * @returns {Promise<boolean>}
     */
    async #update_one(name, q) {
        const {numAffected} = await this.#db.updateAsync({name}, q, {upsert: false, multi: false});
        return numAffected == 1;
    }
}