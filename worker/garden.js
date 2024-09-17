import cluster from "cluster";
import {register_rpc_call, get_rpc_fn} from '../util/cluster_rpc.js'
import {Table} from "../data/storage.js";
import {seed_from_id} from "../data/seed.js";
import {Plant} from "../data/plant.js";
import {Logger} from "../util/logger.js";
import {Scheduler} from "../util/scheduler.js";

Math.clamp = function (min, val, max) {
    if (min < val) return min;
    if (max < val) return max;
    return val;
}

export class GardenWorker {
    /*** @type {Table<Plant>}*/
    #plants = new Table();

    #logger = new Logger(`GardenWorker[${cluster.worker?.id}]`);

    #scheduler = new Scheduler(this.#logger.header);

    /**
     * @param sender {Sender}
     */
    constructor(sender) {
        register_rpc_call('add_plants', this.add_plants.bind(this));
        register_rpc_call('init_plants', this.init_plants.bind(this));
        register_rpc_call('get_all_plants', this.get_all_plants.bind(this));


        /**
         * Sending to primary server
         * @type {(x: number, y: number) => void}
         */
        this.send_remove_plant = get_rpc_fn(sender, 'remove_plant', true);
        /**
         * Flushing all data to primary server
         * @type {(plants: PlantDTO[]) => void}
         */
        this.post_all_plants = get_rpc_fn(sender, 'post_all_plants', true);

        // force flushing all data before process closing
        process.on('beforeExit', () => {
            this.post_all_plants(this.get_all_plants());
        });
    }

    /**
     * removing plant
     * @param plant {Plant}
     */
    #remove_plant(plant) {
        this.send_remove_plant(plant.x, plant.y);
        this.#plants.remove(plant.x, plant.y);
    }

    /**
     * Plant scheuling growh worker
     * @param plant {Plant}
     */
    #tick_plant(plant) {
        if (plant.is_finished) return;

        if (plant.is_dead) {
            return this.#remove_plant(plant);
        }

        switch (plant.tick()) {
            case true:
                this.#logger.debug('Fully grown', plant.toString());
                return;

            case false:
                this.send_remove_plant(plant.x, plant.y);
                this.#plants.remove(plant.x, plant.y);
                this.#logger.debug('Dead', plant.toString());
                return;

            default:
                const now = Date.now();
                const planned = plant.last_check + plant.seed.per_stage;
                const next = Math.clamp(now, planned, now + plant.seed.per_stage);
                this.#scheduler.add(next, () => this.#tick_plant(plant));
                return;
        }
    }

    /**
     * Adding plant to worker
     * @param plant {PlantDTO}
     */
    #add_plant(plant) {
        if (!plant)
            throw new Error('No plant');

        // make sure int fields
        for (let key of 'x y stage seed'.split(' ')) {
            plant[key] = Math.floor(+plant[key]);
            if (!Number.isInteger(plant[key])) {
                throw new Error(`Wrong plant key="${key}" value=${plant[key]}`);
            }
        }

        if (this.has_plant(plant.x, plant.y))
            throw new Error('Space is already taken');

        const seed = seed_from_id(plant.seed);
        if (!seed)
            throw new Error(`unknown seed: ${plant.seed}`);

        plant.stage = Math.clamp(-seed.stages, plant.stage, seed.stages);

        this.#plants.set(plant.x, plant.y, new Plant(plant.x, plant.y, seed, plant.stage, !!plant.dmg, new Date(plant.last)));
        const now = Date.now();

        this.#scheduler.add(Math.clamp(now, plant.last + seed.per_stage, now + seed.per_stage),
            () => this.#tick_plant(this.#plants.get(plant.x, plant.y)));
    }

    /**
     * Checking if has plant on this position
     * @param x {number}
     * @param y {number}
     * @returns {boolean}
     */
    has_plant(x, y) {
        return this.#plants.has(x, y);
    }

    /**
     *
     * @param plants {PlantDTO | PlantDTO[]}
     */
    add_plants(plants) {
        const timer = this.#logger.time_start('add_plants');
        plants ||= [];
        if (!Array.isArray(plants))
            plants = [plants];

        const success = [];

        for (let plant of plants) {
            try {
                this.#add_plant(plant);
                success.push({x: plant.x, y: plant.y});
            } catch (e) {
                this.#logger.error(`Cannot plant here:`, {plant, error: e});
            }
        }

        timer.stop();

        return success;
    }

    init_plants(arr) {
        this.#plants.clear();
        this.add_plants(arr);
    }

    /**
     * Interacting with plant
     * @param x {number}
     * @param y {number}
     * @returns {{heal: boolean}|{drop: number}}
     */
    interact(x, y) {
        if (!Number.isInteger(x) || !Number.isInteger(y))
            throw new Error('Works only with integer values');

        const plant = this.#plants.get(x, y);
        if (!plant)
            throw new Error(`No plants on this cords: [${x}:${y}]`);

        if (plant.is_finished) {
            this.#remove_plant(plant);
            return {drop: plant.seed.random_drop()};
        }

        if (plant.damaged) {
            plant.damaged = false;
            return {heal: true};
        }

        throw new Error('Cannot interact with growing plant');
    }

    /**
     * Returns all plants using by this worker
     *  @return {PlantDTO[]}
     */
    get_all_plants() {
        return Array.from(this.#plants.get_all()).map(x => ({
            x: x.x,
            y: x.y,
            seed: x.seed.index,
            stage: x.stage,
            dmg: !!x.damaged,
            last: x.last_check.valueOf(),
        }));
    }
}