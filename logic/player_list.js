import Database from '@seald-io/nedb';
import {Logger} from "../util/logger.js";
import cluster from "cluster";
import {inc, is_in_test, pick, pretty_print} from "../util/_.js";
import {all_seeds, seed_from_id} from "../data/seed.js";

/**
 * @typedef {Object} PlayerStats
 * @property {number} interaction
 * @property {number} register
 * @property {number} weed_removed
 * @property {number} teleported
 * @property {number} plant_collected
 * @property {number} planted
 * @property {number | null} login
 * @property {number} play_time
 */

/**
 * @typedef {Object} PlayerAbilities
 * @property {number} max_speed
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


/**
 * @type {PlayerAbilities}
 */
const default_abilities = {
    max_speed: 3,
    timeout: 200,
    reach_distance: 1.6,
    view_distance: 30,
};

export class PlayerList {
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

        if (is_in_test()) {

            this.t = {
                /**
                 * Async find
                 * @param q {Partial<PlayerData>}
                 * @returns {Nedb.Cursor<PlayerData[]>}
                 */
                find: q => this.#db.findAsync(q),
                /*** @type {PlayerAbilities}*/
                abilities: this.#abilities,
            }
        }
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
        if (is_online && Number.isFinite(player?.stats?.login)) {
            this.#logger.debug(`already online ${name} ${now - player.stats.login}mls`);
            throw new Error('already online ' + name);
        }

        // going offline again (error)
        if (!is_online && !Number.isFinite(player?.stats?.login)) {
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
        if (!await this.#check_interact_timeout(name)) {
            this.#logger.debug(`set_pos denied due to ${name} spam`);
            return false;
        }

        if (![x_delta, y_delta].every(x => Number.isFinite(x))) {
            this.#logger.debug(`wrong set_pos arguments`, pretty_print({x_delta, y_delta}));
            return false;
        }

        // checking if speed is appropriate
        if (Math.hypot(x_delta, y_delta) > this.#abilities.max_speed) {
            this.#logger.log(`too fast player`, pretty_print({
                x_delta,
                y_delta,
                speed: Math.hypot(x_delta, y_delta),
                max_allowed: this.#abilities.max_speed,
            }));
            return false;
        }

        // incrementing position
        return await this.#update_one({name}, {$inc: {x: x_delta, y: y_delta}});
    }

    /**
     * Teleporting player to location
     * @param name {string}
     * @param x {number}
     * @param y {number}
     * @returns {Promise<boolean>}
     */
    async teleport(name, {x, y}) {
        // checking the interaction spam
        if (!await this.#check_interact_timeout(name))
            return false;

        if (![x, y].every(x => Number.isFinite(x)))
            return false;

        return await this.#update_one({name}, {$set: {x, y}, $inc: {'stats.teleported': 1}});
    }

    /**
     * Removing weed / collecting plant
     * @param name {string}
     * @param pos {{x: number, y: number}}
     * @param gardens {IGarden[]}
     * @returns {Promise<boolean>}
     */
    async interact(name, pos, gardens) {
        if (!await this.#check_interact_timeout(name)) {
            this.#logger.debug(`interact rejected due to player ${name} spam requests`);
            return false;
        }

        const player = await this.#db.findOneAsync({name});
        if (Math.hypot(player.x - pos.x, player.y - pos.y) > this.#abilities.reach_distance) {
            this.#logger.debug(`interact rejected due to player trying to reach far object`,
                pretty_print({
                    name,
                    distance: Math.hypot(player.x - pos.x, player.y - pos.y),
                    max_allowed: this.#abilities.reach_distance,
                }));
            return false;
        }

        pos = {
            x: Math.floor(pos.x),
            y: Math.floor(pos.y),
        }

        const resps = await Promise.all(gardens.map(async x => await x.has_plant(pos) && x));
        /** @type {IGarden} */
        const garden = resps.find(x => !!x);
        if (!garden) {
            this.#logger.debug('Plant is not exist here:', pretty_print(pos));
            return false;
        }

        const resp = await garden.interact(pos);
        if (!resp) {
            this.#logger.debug('Garden rejected interaction', pretty_print({...pos, name}));
            return false;
        }

        const {weed_removed, seed, amount} = resp;

        if (weed_removed) {
            inc(player.stats, 'weed_removed', 1);
            this.#logger.debug('Weed removed', pretty_print({...pos, name}));
        }
        if (amount) {
            inc(player.stats, 'plant_collected', 1);
            inc(player.container, seed, amount);
            this.#logger.debug('Plant collected', pretty_print({...pos, name}));
        }

        return await this.#update_one(pick(player, 'name'), pick(player, 'stats', 'container'));
    }

    /**
     * Plant seed in garden
     * @param name {string}
     * @param x {number}
     * @param y {number}
     * @param seed {number}
     * @param gardens {IGarden[]}
     * @returns {Promise<boolean>}
     */
    async plant(name, {x, y}, seed, gardens) {
        // seed exists
        const seed_obj = seed_from_id(seed);
        if (!seed_obj) {
            this.#logger.debug(`Unknown seed: ${seed}`);
            return false;
        }

        // checking interaction
        if (!await this.#check_interact_timeout(name)) return false;

        // retreiving player
        const player = await this.#db.findOneAsync({name});
        if (!player) {
            this.#logger.debug(`No player founded: ${name}`);
            return false;
        }

        // checking seed amount
        if (!Number.isFinite(player.container[seed]) || player.container[seed] < 1) {
            this.#logger.debug(`No seed=${seed} available: ${player.container[seed]}`);
            return false;
        }

        const pos = {
            x: Math.floor(x),
            y: Math.floor(y),
        };

        // checking if place is taken
        const has_plants = await Promise.all(gardens.map(x => x.has_plant(pos)));
        if (has_plants.some(x => !!x)) {
            this.#logger.debug('this pos is taken', pretty_print(pos));
            return false;
        }

        const counts = await Promise.all(gardens.map(g => g.count().then(x => ({
            garden: g,
            count: x,
        }))));

        // soring from min plants to max
        for (const min of new Set(counts.map(x => x.count).sort())) {
            // selecting gardens to check
            for (let garden of counts.filter(x => x.count == min).map(x => x.garden)) {
                // trying to add plant
                if (await garden.add_plants({...pos, seed})) {

                    this.#logger.debug(garden.toString(), 'plant seed:', pretty_print({...pos, seed: seed_obj.name}));
                    if (!await this.#update_one({name}, {
                        $inc: {
                            [`container.${seed}`]: -1,
                            'stats.planted': 1,
                        }
                    })) {
                        this.#logger.error(`Cannot update player ${name}`);
                    }

                    return true;
                }
            }
        }

        return false;
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
            'stats.interaction': {$lte: now - this.#abilities.timeout},
            'stats.login': {$gt: 0},
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
        if (!Object.keys(modify).some(x => x.startsWith('$')))
            modify = {$set: modify};
        const {numAffected} = await this.#db.updateAsync(q, modify, {upsert: false, multi: false});
        return numAffected == 1;
    }
}