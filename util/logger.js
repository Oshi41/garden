const levels = {
    debug: 0,
    log: 1,
    error: 2,
    none: Number.MAX_SAFE_INTEGER,
};

let min_level = 'debug';

export function get_min_level() {
    return min_level;
}

/**
 *
 * @param lvl {keyof levels}
 */
export function set_min_level(lvl) {
    min_level = lvl;
}

const date_format = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',

    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
});
const duration_format = new Intl.RelativeTimeFormat('en-US', {
    numeric: 'always',
    localeMatcher: 'best fit',
    style: 'long',
});

export class Logger {
    #header;

    /**
     * @param header {string}
     */
    constructor(header) {
        this.#header = header;

        this.log = (...msg) => this.#write_log('log', ...msg);
        this.debug = (...msg) => this.#write_log('debug', ...msg);
        this.error = (...msg) => this.#write_log('error', ...msg);
    }

    get header() {
        return this.#header;
    }

    #write_log(level, ...msg) {
        if (levels[level] < levels[get_min_level()]) return;

        const date = new Date();
        const time = `${date_format.format(date)}.${date.getUTCMilliseconds().toString().padStart(3, '0')}`;

        if (level == 'debug')
            level = 'log';
        console[level](time, this.#header, ...msg);
    }

    /**
     * Starts timer to see execution time
     * @param label
     * @returns {{stop: *}}
     */
    time_start(label) {
        const date = Date.now();
        return {
            /**
             * @type {()=>void}
             */
            stop: () => {
                const diff = Date.now() - date;
                this.log(label, duration_format.format(diff, 'seconds'));
                this.post_metric(label + '_time', diff);
            }
        };
    }

    /**
     * Posting metric to monitor
     * @param name {string} metric name
     * @param amount {any}
     */
    post_metric(name, amount) {
    }
}