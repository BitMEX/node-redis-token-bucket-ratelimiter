var util = require('util'),
    luaScript = require('./lua/rollingLimit.lua.json'),
    debug = util.debuglog('redis-rolling-limit');

function RollingLimit(options) {
    if (typeof options !== 'object' || options === null) {
        throw new TypeError('options must be an object');
    }
    if (typeof options.interval !== 'number') {
        throw new TypeError('interval must be a number');
    }
    if (typeof options.limit !== 'number') {
        throw new TypeError('limit must be a number');
    }
    //noinspection JSLint
    if (!options.redis || typeof options.redis.eval !== 'function') {
        throw new TypeError('redis must be an instance of RedisClient');
    }
    if (options.prefix && typeof options.prefix !== 'string') {
        throw new TypeError('prefix must be a string');
    }
    this.interval = options.interval;
    this.limit = options.limit;
    this.redis = options.redis;
    this.prefix = options.prefix || '';
}

RollingLimit.prototype.use = function(id, amt, cb) {
    var amount = amt,
        callback = cb;
    if (typeof amount === 'function') {
        callback = amount;
        amount = 1;
    } else if (typeof callback !== 'function') {
        throw new TypeError('callback must be a function');
    }
    this.redis.evalsha(luaScript.sha1, 1, this.prefix + id, this.limit, this.interval, Date.now(), amount, function(err, res) {
        if (!err) {
            callback(null, res);
            return;
        }
        //handle errors
        //NOSCRIPT just means it hasn't been cached yet
        if (!(err instanceof Error) || err.message.indexOf('NOSCRIPT') === -1) {
            debug('evalsha error:', err);
            callback(err, 0);
            return;
        }
        //noinspection JSLint
        this.redis.eval(luaScript.script, 1, this.prefix + id, this.limit, this.interval, Date.now(), amount, callback);
    }.bind(this));
};

RollingLimit.prototype.fill = function(id, cb) {
    if (typeof cb !== 'function') {
        throw new TypeError('callback must be a function');
    }
    this.redis.zremrangebyrank(this.prefix + id, 0, -1, cb);
};

module.exports = RollingLimit;
