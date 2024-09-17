import cluster from 'cluster';
import {deepEqual as de, fail} from 'assert'
import {describe, it, before, beforeEach} from 'node:test';
import {createSandbox} from 'sinon';
import {DatabaseWorker} from "../worker/database.js";
import {GardenWorker} from "../worker/garden.js";

if (cluster.isWorker) {
    const worker = new GardenWorker({
        id: cluster.worker.id,
        send: process.send.bind(process),
    });

} else {
    describe('GardenWorker[cluster]', () => {
        /** @type {DatabaseWorker}*/
        let worker;
        /*** @type {PlantDTO[]}*/
        let plants;

        before(async () => {
            for (let i = 0; i < 5; i++) {
                cluster.fork();
            }

            worker = new DatabaseWorker({plants: 'plants.jsonl', players: 'players.jsonl'});
        });

        beforeEach(async () => {
            plants = Array.from(Array(10_000).keys()).map(x => ({
                x,
                y: x + 1,
                seed: x % 3,
                last: Date.now(),
                stage: 0,
                dmg: false
            }));

            worker.t.assign_to_workers(plants, {clear: true});
        });

        it('works', () => {
            for (let {x, y} of plants) {
                if (!Object.values(cluster.workers).some(w => w.has_plant(x, y)))
                    fail(`Plant is missing [${x}:${y}]`);
            }
        });
    });
}