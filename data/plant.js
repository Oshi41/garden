import {seed_from_id} from "./seed";

class Plant {

    /**
     * @param x {number}
     * @param y {number}
     * @param stage {number}
     * @param type {number}
     * @param damaged {boolean}
     * @param last_check {Date}
     */
    constructor(x, y, stage, type, damaged, last_check) {
        /**
         * X position
         * @type {number}
         */
        this.x = x;

        /**
         * Y position
         * @type {number}
         */
        this.y = y;

        /**
         * Current stage
         * @type {number}
         */
        this.stage = stage;

        /**
         * Growing seed
         * @type {Seed}
         */
        this.seed = seed_from_id(type);

        /**
         * Is plant damaged
         * @type {boolean}
         */
        this.damaged = damaged;

        /**
         * Last plant check
         * @type {Date}
         */
        this.last_check = last_check || Date.now();
    }

    /**
     * Should delete plant after decay
     * @returns {boolean}
     */
    get should_delete(){
        return this.stage <= -this.seed.stages;
    }

    /**
     * Is grow fully grown
     * @returns {boolean}
     */
    get is_finished(){
        return this.stage >= this.seed.stages;
    }

    /**
     * Is about time to grow/decay
     * @returns {boolean}
     */
    get about_time(){
        return Date.now() - this.last_check >= this.seed.per_stage;
    }

    /**
     * Can grow or decay
     * @returns {boolean}
     */
    can_increment() {
        return !this.should_delete && !this.is_finished && this.about_time;
    }

    /**
     * Increment plant state.
     * @returns {boolean} - true - fully grown, false - should remove plant, null otherwise
     */
    increment() {
        this.last_check = new Date();

        if (this.damaged)
            this.stage++;

        if (this.damaged || Math.random() < this.seed.fragility) {
            this.damaged = true;
            this.stage--;
        }

        if (this.should_delete) return false;
        if (this.is_finished) return true;
    }
}