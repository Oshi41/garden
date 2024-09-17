import cluster from "cluster";
import {Logger} from "../util/logger.js";
import {Scheduler} from "../util/scheduler.js";
import {call_rpc, register_rpc_call} from "../util/cluster_rpc.js";
import * as path from "node:path";
import * as fs from "node:fs";
import Database from '@seald-io/nedb';
import {Table} from "../data/storage.js";
import {round_robin} from "../util/round_robin.js";

const sec = 1000, min = 60 * sec;

export class DatabaseWorker {
    #logger = new Logger(`DatabaseWorker`);
    #scheduler = new Scheduler(this.#logger.header);

    /*** @type {Database<PlayerDTO>}*/
    #players;

    /*** @type {Database<PlantDTO>}*/
    #plants;

    /*** @type {Table<number>}*/
    #plant2worker = new Table();

    /**
     * @param plants {string}
     * @param players {string}
     */
    constructor({plants, players}) {
        if (!cluster.isPrimary)
            throw new Error('Must be created within a primary cluster');

        this.#check_filepath(plants);
        this.#check_filepath(players);

        this.#players = new Database({filename: players});
        this.#plants = new Database({filename: plants});

        // called when error occurred
        register_rpc_call('post_all_plants', (plants, worker) => {
            this.#setup_worker_plants(worker, plants, {clear: 1, flush: 1});
        });

        // worker removed plant
        register_rpc_call('remove_plant', (x, y) => {
            this.#plant2worker.remove(x, y);
        });

        // clear plants from worker
        cluster.on('exit', worker => {
            this.#setup_worker_plants(worker);
        });

        if (process?.env?.NODE_TEST_CONTEXT) {
            this.t = {
                assign_to_workers: this.#assign_to_workers.bind(this),
            };
        }

        new Promise(async resolve => {
            await this.#players.ensureIndexAsync({fieldName: 'id', unique: true});
            await this.#players.loadDatabaseAsync();

            await this.#plants.ensureIndexAsync({fieldName: ['x', 'y'], unique: true});
            await this.#plants.loadDatabaseAsync();

            this.#scheduler.add(Date.now() + 5 * min, this.#flush_from_workers.bind(this));
            resolve();
        });
    }

    /**
     * Managing with
     * @param worker {cluster.Worker}
     * @param plants {PlantDTO[]}
     * @param clear {boolean} clear saved plants
     * @param flush {boolean} save to DB
     */
    async #setup_worker_plants(worker, plants = [], {clear = true, flush = false} = {}) {
        if (clear) {
            const deleted = this.#plant2worker.remove_if((x, y, value) => value == worker.id);

            // delete all from database
            if (flush) {
                const q = Array.from(deleted.keys());
                await this.#plants.removeAsync({$or: q}, {multi: true});
            }
        }

        for (let plant of plants) {
            this.#plant2worker.set(plant.x, plant.y, worker.id);
        }

        if (flush) {
            await this.#plants.insertAsync(plants);
        }

        const existing = this.#plant2worker.keys();
        const abandoned = await this.#plants.findAsync({$not: {$or: existing}});
        if (abandoned?.length) {
            this.#logger.debug('Abandoned plants founded:', abandoned.length);
            this.#assign_to_workers(abandoned, {clear: false});
        }
    }

    #assign_to_workers(plants, {clear = false} = {}) {
        const arr_length = Math.min(1000, Math.ceil(plants.length / Object.keys(cluster.workers).length));

        for (let worker of round_robin(Object.values(cluster.workers))) {
            if (plants?.length) {
                const to_send = plants.splice(0, arr_length);
                this.#init_garden_worker(worker, to_send, clear ? 'init_plants' : 'add_plants');
            } else {
                break;
            }
        }
    }

    async #flush_from_workers() {
        const timer = this.#logger.time_start('#flush_from_workers');

        const all = await Promise.all(Object.values(cluster.workers)
            .map(x => call_rpc(x, {name: 'get_all_plants'})));

        const plants = all.flatMap(x => x);
        await this.#plants.dropDatabaseAsync();
        await this.#plants.insertAsync(plants);

        this.#scheduler.add(Date.now() + 5 * min, this.#flush_from_workers.bind(this));

        timer.stop();
    }

    async read_from_db() {
        const timer = this.#logger.time_start('read_from_db');

        const all = await this.#plants.findAsync({}).sort({x: 1, y: 1});
        this.#assign_to_workers(all, {clear: 1});
        timer.stop();
    }

    /**
     *
     * @param worker {cluster.Worker}
     * @param plants {PlantDTO[]}
     * @param name {'init_plants' | 'add_plants'}
     */
    async #init_garden_worker(worker, plants, name = 'init_plants') {
        const {result, error} = await call_rpc(worker, {name}, plants);
        if (error) {
            this.#logger.error(`Error while initialize garden worker ${worker.id}: ${error}`);
            worker.disconnect();
            return;
        }

        /**
         * Is the worker assign for exact plant
         * @param x {number}
         * @param y {number}
         * @returns {boolean}
         */
        worker.has_plant = (x, y) => this.#plant2worker.get(x, y) == worker.id;

        // remember which worker assign with exact plants
        for (let {x, y} of (result || [])) {
            this.#plant2worker.set(x, y, worker.id);
        }
    }

    #check_filepath(filename) {
        const dir = path.dirname(filename);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, {recursive: true});
        }
        if (!fs.existsSync(filename))
            fs.writeFileSync(filename, '', {encoding: 'utf8'});
    }
}