import cluster from "cluster";
import {get_rpc_fn, register_rpc_call} from "./util/cluster_rpc.js";
import fs from "fs";
import {Garden} from "./logic/garden.js";
import os from "os";
import path from "path";
import {PlayerList} from "./logic/player_list.js";
import {Logger} from "./util/logger.js";
import {pretty_print} from "./util/_.js";

function check_file_name(filename) {
    const dir = path.dirname(filename);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {recursive: true});
    }

    if (!fs.existsSync(filename)) {
        fs.writeFileSync(filename, '', 'utf-8');
    }

    return filename;
}

const logger = new Logger(`[${cluster.worker?.id || 'master'}-main]`);

/**
 *
 * @param sender {Sender}
 * @returns {Promise<IGarden>}
 */
function create_garden_rpc(sender) {
    if (!cluster.isPrimary) {
        throw new Error('Should called on cluster only');
    }

    if (!sender) {
        throw new Error('No sender provided');
    }

    return {
        has_plant: get_rpc_fn(sender, 'Garden.has_plant'),
        count: get_rpc_fn(sender, 'Garden.count'),
        interact: get_rpc_fn(sender, 'Garden.interact'),
        add_plants: get_rpc_fn(sender, 'Garden.add_plants'),
    }
}

/**
 * Entry worker point
 * @returns {Promise<Garden>}
 */
async function main_worker() {
    const timer = logger.time_start('main_worker_' + cluster.worker?.id);

    if (!cluster.isWorker)
        throw new Error('Should called on worker only');

    const {garden_file_path: filename} = process.env;

    if (!path.isAbsolute(filename)) {
        throw new Error('No "garden_file_path" env defined or no file exists: ' + garden_file_path);
    }

    check_file_name(filename);

    const worker = new Garden({filename});
    await worker.init();

    logger.debug('Garden created and running', pretty_print({
        plants_count: await worker.count(),
    }));

    // register IGarden functions
    register_rpc_call('Garden.has_plant', worker.has_plant.bind(worker));
    register_rpc_call('Garden.add_plants', worker.add_plants.bind(worker));
    register_rpc_call('Garden.interact', worker.interact.bind(worker));
    register_rpc_call('Garden.count', worker.count.bind(worker));

    timer.stop();

    return worker;
}

/**
 * Entry cluster point
 * @returns {Promise<void>}
 */
async function main_cluster() {
    const timer = logger.time_start('main_cluster');

    if (!cluster.isPrimary)
        return;

    const max = os.availableParallelism();
    /*** @type {WeakMap<Worker, {garden: IGarden, garden_file_path: string}>}*/
    const gardens = new WeakMap();

    for (let i = 1; i <= max; i++) {
        const garden_file_path = path.resolve(`./data/garden_${i}.jsonl`);
        const worker = cluster.fork({garden_file_path});
        gardens.set(worker, {
            garden: create_garden_rpc(worker),
            garden_file_path
        });
    }

    cluster.on('exit', w => {
        const {garden_file_path} = gardens.get(w);
        cluster.fork({garden_file_path});
    });

    const filename = check_file_name('./data/players.jsonl');
    const worker = new PlayerList({filename});
    await worker.init();

    logger.debug('PlayerList created and running');

    timer.stop();
}

// direct script load
if (process.argv[1] === import.meta.filename) {
    const main_fn = cluster.isPrimary ? main_cluster : main_worker;
    main_fn();
}