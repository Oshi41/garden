const seeds = [];

export class Seed {
    /**
     * @param name {string}
     * @param stages {number}
     * @param time {number}
     * @param fragility {number}
     * @param max_result {number}
     */
    constructor(name, stages, time, fragility, max_result) {

        /**
         * Plant name
         * @type {string}
         */
        this.name = name;

        /**
         * Amount of growing stages
         * @type {number}
         */
        this.stages = stages;

        /**
         * Full time growth
         * @type {number}
         */
        this.time = time;

        /**
         * Probability of weed appearing (0 - 1)
         * @type {number}
         */
        this.fragility = fragility;

        /**
         * Type index
         * @type {number}
         */
        this.index = seeds.length;

        /**
         * Mls per stage
         * @type {number}
         */
        this.per_stage = this.time / this.stages;

        /**
         * Amount of seed to return after collect
         * @type {number}
         */
        this.max_result = max_result;

        seeds.push(this);
    }

    /**
     * Generates random drop from seed type
     * @returns {number}
     */
    random_drop() {
        return 1 + Math.floor(Math.random() * (this.max_result - 1));
    }
}

/**
 * @param id
 * @returns {Seed}
 */
export function seed_from_id(id) {
    return seeds[id];
}

/**
 * All existing seeds
 * @returns {Seed[]}
 */
export function all_seeds() {
    return seeds;
}

const sec = 1000, min = 60 * sec;


new Seed('wheat', 4, 5 * min, 0.5, 3);
new Seed('potato', 3, 10 * min, 0.4, 5);
new Seed('carrot', 4, 3 * min, 0.7, 3);
new Seed('dandelion', 2, 2 * min, 0.1, 2);