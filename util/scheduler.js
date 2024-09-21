import {Logger} from "./logger.js";
import {is_in_test} from "./_.js";

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

        if (is_in_test()) {
            const _this = this;
            this.t = {
                get min_step() {
                    return _this.#min_step
                },
                set min_step(min_step) {
                    _this.#min_step = min_step;
                },
                queue: this.#queue,
            };
        }
    }

    #setup_next_tick() {
        // clear task if no queue
        if (this.task && !this.#queue.size) {
            this.#logger.debug('clear schedule due to empty queue');
            this.task = clearTimeout(this.task) || null;
        }

        // set new task if needed
        if (!this.task && this.#queue.size) {
            let min = Math.min(...this.#queue); // nearest scheduled time
            min = min + this.#min_step - (min % this.#min_step); // adding min step
            min -= Date.now(); // resolving from now
            this.#logger.debug(`scheduling new task after ${min}mls`);
            this.task = setTimeout(this.#tick.bind(this), min);
        }
    }

    async #tick(now = Date.now()) {
        const timer = this.#logger.time_start('#tick');

        // Remove past dates
        const execute = Array.from(this.#queue).filter(x => x < now);
        execute.filter(x => this.#queue.delete(x));
        if (execute.length) {
            try {
                await this.#fn();
            } catch (e) {
                this.#logger.error('Error during executing task:', e);
            }
        }

        // clear timeout task
        clearTimeout(this.task);
        delete this.task;

        // reshedule new task
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