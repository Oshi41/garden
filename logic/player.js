import Database from '@seald-io/nedb';
import {Logger} from "../util/logger.js";
import cluster from "cluster";
import {inc, omit, pick} from "../util/_.js";
import {all_seeds} from "../data/seed.js";

/**
 * @typedef {Object} PlayerStats
 * @property {number} interaction
 * @property {number} register
 * @property {number} weed_removed
 * @property {number} plant_collected
 * @property {number | null} login
 * @property {number} play_time
 */

/**
 * @typedef {Object} PlayerAbilities
 * @property {number} max_speed_per_second
 * @property {number} timeout
 * @property {number} reach_distance
 * @property {number} view_distance
 */

/**
 * @typedef {Object} PlayerData
 * @property {string} name
 * @property {number} x
 * @property {number} y
 * @property {Object} container
 * @property {Partial<PlayerStats>} stats
 */

/*** @typedef {Pick<Garden, 'has_plant' | 'add_plants' | 'interact'>} IGarden*/

/**
 * @type {PlayerAbilities}
 */
const default_abilities = {
    max_speed_per_second: 3,
    timeout: 200,
    reach_distance: 1.6,
    view_distance: 30,
};

export class Player {
    /** @type {Database<PlayerData>}*/
    #db;

    #logger = new Logger(`Player[${cluster.worker?.id || 'master'}]`);

    /*** @type {PlayerAbilities}*/
    #abilities

    /**
     * @param opts {Database.DataStoreOptions}
     * @param abilities {PlayerAbilities}
     */
    constructor(opts, abilities = default_abilities) {
        this.#abilities = abilities;
        this.#db = new Database(opts);
    }

    async init() {
        await this.#db.ensureIndexAsync({fieldName: ['name'], unique: true});
        await this.#db.loadDatabaseAsync();
    }

    /**
     * Change online status here
     * @param name {string}
     * @param is_online {boolean}
     * @throws {Error} on logical errors
     * @returns {Promise<PlayerData>}
     */
    async set_online(name, is_online) {
        let player = await this.#db.findOneAsync({name});
        let now = Date.now();

        // going offline first time (error)
        if (!player && !is_online) {
            this.#logger.debug(`such player is not exist ${name}`);
            throw new Error('player is not exist ' + name);
        }

        // going online again (error)
        if (is_online && Number.isFinite(player.stats.login)) {
            this.#logger.debug(`already online ${name} ${now - player.stats.login}mls`);
            throw new Error('already online ' + name);
        }

        // going offline again (error)
        if (!is_online && !Number.isFinite(player.stats.login)) {
            this.#logger.debug(`already offline ${name}`);
            throw new Error('already offline ' + name);
        }

        // register, creating new player
        if (!player) {
            this.#logger.debug(`greet player ${name}`);
            player = {
                name,
                // 10 seed of each type
                container: all_seeds().reduce((acc, prev) => Object.assign(acc, {[prev.index]: 10}), {}),
                stats: {
                    register: now,
                    login: now,
                    interaction: now,
                },
                // random place
                x: (Math.random() - 0.5) * 50,
                y: (Math.random() - 0.5) * 50,
            };

            return await this.#db.insertAsync(player);
        }

        if (!is_online) {
            if (Number.isFinite(player.stats.login))
                inc(player.stats, 'play_time', now - player.stats.login);
            else
                this.#logger.debug(`player ${name} missed login time: ${player.stats.login}`);
        }

        player.stats.login = is_online ? now : null;

        // updating error
        if (!await this.#update_one(pick(player, 'name'), pick(player, 'stats'))) {
            this.#logger.debug(`cannot update player ${name}`);
            throw new Error('server error');
        }

        return player;
    }

    /**
     *
     * change pos of player
     * @param name
     * @param x_delta {number} x delta
     * @param y_delta {number} y delta
     * @returns {Promise<boolean>}
     */
    async set_pos(name, {x_delta, y_delta}) {
        // checking the interaction spam
        if (!await this.#check_interact_timeout(name)) return false;

        // checking if speed is appropriate
        if (Math.hypot(x_delta, y_delta) > this.#abilities.max_speed_per_second) return false;

        // incrementing position
        return await this.#update_one({name}, {$inc: {x: x_delta, y: y_delta}});
    }

    /**
     * Removing weed / collecting plant
     * @param player {PlayerData}
     * @param pos {{x: number, y: number}}
     * @param gardens {IGarden[]}
     * @returns {Promise<boolean>}
     */
    async interact(player, pos, gardens) {
        if (!await this.#check_interact_timeout(player.name)) return false;
        if (Math.hypot(player.x - pos.x, player.y - pos.y) > this.#abilities.reach_distance) return false;

        pos = {
            x: Math.floor(pos.x),
            y: Math.floor(pos.y),
        }

        const resps = await Promise.all(gardens.map(async x => await x.has_plant(pos) && x));
        /** @type {IGarden} */
        const garden = resps.find(x => !!x);
        if (!garden) return false;

        const resp = await garden.interact(pos);
        if (!resp) return false;

        const {damaged, seed, amount} = resp;

        if (damaged)
            inc(player.stats, 'weed_removed', 1);
        if (amount) {
            inc(player.stats, 'plant_collected', 1);
            inc(player.container, seed, amount);
        }

        return await this.#update_one(pick(player, 'name'), pick(player, 'stats', 'container'));
    }

    /**
     *
     * @param name
     * @returns {Promise<boolean>}
     */
    async #check_interact_timeout(name) {
        const now = Date.now();
        const q = {
            name,
            $lte: {'stats.interaction': now - this.#abilities.timeout},
            $gt: {'stats.online': 0},
        };
        const modify = {'stats.interaction': now};
        if (await this.#update_one(q, modify)) {
            this.#logger.debug(`player ${name} interaction request`);
            return true;
        }

        this.#logger.debug(`player ${name} interaction spam`);
        return false;
    }

    /**
     * update single player
     * @param q {Partial<PlayerData>}
     * @param modify {Partial<PlayerData>}
     * @returns {Promise<boolean>}
     */
    async #update_one(q, modify) {
        const {numAffected} = await this.#db.updateAsync(q, modify, {upsert: false, multi: false});
        return numAffected == 1;
    }
}