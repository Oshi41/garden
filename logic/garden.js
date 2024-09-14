import cluster from 'cluster';
import path from 'path';
import fs from 'fs';
import Database from '@seald-io/nedb';
import {Chunk} from "../data/chunk.js";
import {Logger} from "../logger.js";
import {Plant} from "../data/plant.js";
import {seed_from_id} from "../data/seed.js";

/**
 * @typedef {Object} DbPlant
 * @property {number} seed
 * @property {number} x
 * @property {number} y
 * @property {number} stage
 * @property {boolean} dmg
 * @property {number} last
 */

/**
 * @param src {DbPlant}
 * @return {Plant}
 */
function db2application(src) {
    return new Plant(src.x, src.y, src.seed, src.stage, src.dmg, new Date(src.last));
}

/**
 * @param src {Plant}
 * @return {DbPlant}
 */
function application2db(src) {
    return {
        x: src.x,
        y: src.y,
        seed: src.seed.index,
        dmg: src.damaged,
        stage: src.stage,
        last: src.last_check.valueOf()
    };
}

class Worker {
    async constructor() {
        if (!cluster.isWorker)
            throw new Error('must be a worker node');

        const x = Math.floor(+process.env.pos_x);
        const y = Math.floor(+process.env.pos_y);

        if (!Number.isInteger(x) || !Number.isInteger(y)) {
            throw new Error('pos_x and pos_y must be int variables');
        }

        this.chunk = new Chunk(x, y);
        this.logger = new Logger(`[WORKER][${this.chunk.i}:${this.chunk.j}]`);

        const timer = this.logger.time_start('constructor');

        this.filename = path.resolve(`../world/${this.chunk.i}:${this.chunk.j}.jsonl`);
        if (!fs.existsSync(path.dirname(this.filename))) {
            fs.mkdirSync(path.dirname(this.filename));
        }
        if (!fs.existsSync(this.filename)) {
            fs.writeFileSync(this.filename, '', 'utf-8');
        }

        const db = await this.#create_database();
        await db.loadDatabaseAsync();

        const plants = (await db.findAsync({})).map(p => db2application(p));
        this.chunk.init(plants);


        process.on('beforeExit', this.#before_exit.bind(this));

        // stop worker on shutdown
        this.chunk.on('empty_chunk', () => {
            this.#send_msg('empty_chunk');
            cluster.worker.disconnect();
        });

        process.on('message', msg => {
            try {
                this.#handle_message(msg);
            } catch (e) {
                this.logger.error('Error during message handling', e, msg);
                this.logger.post_metric('invalid_worker_message', {
                    chunk: {i: this.chunk.i, j: this.chunk.j},
                    msg: msg.toString('utf-8'),
                    error: e,
                });
            }
        });

        timer.stop();
    }

    /**
     * Creates database with contsraints
     * @returns {Promise<Database<DbPlant>>}
     */
    async #create_database() {
        const db = new Database({filename: this.filename});
        await db.ensureIndexAsync({fieldName: ['x', 'y'], unique: true});
        return db;
    }

    /**
     * Flush all data to file here
     * @returns {Promise<void>}
     */
    async #before_exit() {
        const timer = this.logger.time_start('save');

        /*** @type {DbPlant[]}*/
        const data = this.chunk.get_data().map(x => application2db(x));

        fs.writeFileSync(this.filename, '', 'utf-8');
        const db = await this.#create_database();
        await db.loadDatabaseAsync();
        await db.insertAsync(data);
        await db.compactDatafileAsync();

        timer.stop();
    }

    #send_msg(type, payload) {
        process.send(JSON.stringify({type, payload}));
    }


    #handle_message(msg) {
        const {type, payload} = JSON.parse(msg.toString('utf-8'));
        switch (type) {
            case 'interact': {
                const {x, y} = payload;
                const result = this.chunk.interact(x, y);
                this.#send_msg('interact', result);
                break;
            }

            case 'plant_seed': {
                const {x, y, seed} = payload;
                const result = this.chunk.plant_seed(seed_from_id(seed), x, y);
                this.#send_msg('plant_seed', result);
                break;
            }
        }
    }
}