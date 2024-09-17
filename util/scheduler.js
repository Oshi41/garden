import {MapList} from "../data/storage.js";
import {Logger} from "./logger.js";

export class Scheduler {
    /**
     *
     * @type {MapList<number, Function>}
     */
    #queue = new MapList();
    /*** @type {Logger}*/
    #logger;

    constructor(base_header) {
        this.#logger = new Logger(`${base_header}:[Scheduler]`);
    }

    async #tick(now = Date.now()) {
        const timer = this.#logger.time_start('#tick');

        const keys = this.#queue.keys().sort()

        for (let key of keys.filter(x => x <= now)) {
            for (let fn of this.#queue.get(key)) {
                try {
                    await fn();
                } catch (e) {
                    this.#logger.error('Error during queued scheduler task', e);
                }
            }
            this.#queue.remove_key(key);
        }

        let next = keys.filter(x => x > now)[0];
        if (Number.isFinite(next)) {
            next -= now;
            clearTimeout(this.task);
            this.task = setTimeout(this.#tick.bind(this), next);
            this.#logger.debug(`Next tick scheduled after ${next} mls`);
        } else {
            this.#logger.debug('No scheduled tasks');
            clearTimeout(this.task);
            this.task = null;
        }

        timer.stop();
    }

    /**
     * Adds new task to scheduler
     * @param when {number} When to scheduler the action
     * @param callback {Function} callback function
     */
    add(when, callback) {
        this.#queue.set(when, callback);
    }
}