import {Logger} from "./logger.js";
import {arr} from "./_.js";

export class Scheduler {
    /*** @type {Set<number>}*/
    #queue = new Set();
    /*** @type {Logger}*/
    #logger;
    #min_step;
    #fn;

    /**
     * @param base_header {string} logger header
     * @param {() => Promise} fn - running function
     * @param min_step {number} min step between function execution
     */
    constructor(base_header, fn, min_step = 1000) {
        this.#logger = new Logger(`${base_header}:[Scheduler]`);
        this.#min_step = min_step;
        this.#fn = fn;
    }

    #setup_next_tick() {
        if (this.task && !this.#queue.size)
            this.task = clearTimeout(this.task) || null;

        if (!this.task && this.#queue.size)
            this.task = setTimeout(this.#tick.bind(this), this.#min_step);
    }

    async #tick(now = Date.now()) {
        const timer = this.#logger.time_start('#tick');

        const execute = Array.from(this.#queue).filter(x => x < now);
        execute.filter(x => this.#queue.delete(x));
        if (execute.length) {
            try {
                await this.#fn();
            } catch (e) {
                this.#logger.error('Error during executing task:', e);
            }
        }

        this.#setup_next_tick();
        timer.stop();
    }

    /**
     * Adds new task to scheduler
     * @param when {number} When to scheduler the action
     */
    add(when) {
        this.#queue.add(when);
        this.#setup_next_tick();
    }
}