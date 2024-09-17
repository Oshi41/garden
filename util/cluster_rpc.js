import cluster from 'cluster';
import {MapList, Table} from "../data/storage.js";
import {Logger} from "./logger.js";

/**
 * @typedef {Object} Sender
 * @property {(msg: any) => void} send
 * @property {string | number | 'master'} id
 */

if (!Promise.withResolvers) {
    Promise.withResolvers = () => {
        const result = {};
        result.promise = new Promise((resolve, reject) => {
            result.resolve = resolve;
            result.reject = reject;
        });
        return result;
    }
}

/*** @type {Map<string, PromiseWithResolvers>}*/
const waiters = new Map();

/*** @type {Map<string, Function>}*/
const handlers = new Map();

const logger = new Logger(cluster.isPrimary
    ? '[CLUSTER]'
    : `[WORKER ${cluster.worker.id}]`);

/**
 * key function
 * @param s
 * @param name
 * @returns {*}
 */
function get_key(s, name) {
    return `${s?.id || 'unknown'}_${name}`;
}

/**
 * Register function as RPC call
 * @param name {string}
 * @param fn {Function}
 */
export function register_rpc_call(name, fn) {
    handlers.set(name, fn);
}

/**
 * Creates function requesting data from other side
 * @template T
 * @param sender {Sender} who will receive the message?
 * @param name {string} RPC registered name
 * @param silent {boolean} wait for response?
 * @returns {(...args) => Promise<T>}
 */
export const get_rpc_fn = (sender, name, silent = false) => async (...args) => {
    if (sender.id != 'master')
    return call_rpc(sender, {name, silent}, ...args);
};

export async function call_rpc(sender, {name, silent = false}, ...args) {
    const key = get_key(sender, name);
    let req = waiters.get(key);
    if (!req) {
        sender.send({rpc: {name, args: [...args], silent}});
        if (silent)
            return Promise.resolve();

        waiters.set(key, req = Promise.withResolvers());
    }
    return await req.promise;
}

/**
 * Handles RPC message
 * @param sender {Sender}
 * @param msg {any}
 */
async function handle_message(sender, msg) {
    logger.debug('RPC message received:', {msg, from: sender.id});

    // need to perform call on this side
    if (msg?.rpc) {
        let {rpc: {name, args, silent}} = msg;
        const fn = handlers.get(name);
        if (!fn) {
            const error = new Error(`${name} RPC is not registered`);
            return sender.send({rpc_resp: {name, error}});
        }
        args ||= [];
        args = Array.isArray(args) ? args : [args];

        try {
            const result = await fn([...args, sender]);
            if (silent) return;

            sender.send({rpc_resp: {name, result}});
        } catch (e) {
            logger.error(`Error during handler call:`, e);
            return sender.send({rpc_resp: {name, error: e}});
        }
    }

    // handling response
    if (msg?.rpc_resp) {
        let {rpc_resp: {name, result, error}} = msg;

        const key = get_key(sender, name);
        const req = waiters.get(key);
        if (!req) {
            logger.debug(`Response was not awaited`, {sender: sender.id, name, result, error});
            return;
        }

        if (error) {
            logger.debug('RPC failed with error:', {name, error, sender: sender.id});
            req.reject(error);
        } else {
            req.resolve(result);
        }
    }
}

if (cluster.isPrimary) {
    cluster.on('message', handle_message);
} else {
    const sender = {
        id: cluster.worker.id,
        send: process.send.bind(process),
    };
    process.on('message', msg => handle_message(sender, msg));
}