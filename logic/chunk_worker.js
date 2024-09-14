import cluster from 'cluster';
import path from 'path';
import fs from 'fs';
import Database from '@seald-io/nedb';
import {Chunk} from "../data/chunk.js";


async function start() {
    const x = Math.floor(+process.env.pos_x);
    const y = Math.floor(+process.env.pos_y);

    if (!Number.isInteger(x) || !Number.isInteger(y)) {
        throw new Error('You must pass pos_x and pos_y environment variables');
    }

    const chunk = new Chunk(x, y);

    let filepath = path.resolve('../storage');
    if (!fs.existsSync(filepath)) {
        fs.mkdirSync(filepath);
    }
    filepath = path.join(filepath, `${chunk.i}:${chunk.j}.jsonl`);
    if (!fs.existsSync(filepath)) {
        fs.writeFileSync(filepath, '', 'utf-8');
    }


}

if (cluster.isWorker) {
    start();
}