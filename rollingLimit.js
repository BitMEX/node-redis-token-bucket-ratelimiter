var util = require('util'),
    log = require('levenlabs-log'),
    luaScript = require('./lua/rollingLimit.lua.json');

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
        callback = cb,
        _this = this;
    if (typeof amount === 'function' || amount == null) {
        callback = amount;
        amount = 1;
    }
    if (callback && typeof callback !== 'function') {
        throw new TypeError('callback must be a function');
    }
    log.debug('rollinglimit: use called', {id: id, amount: amount});
    return new Promise(function(resolve, reject) {
        _this.redis.evalsha(luaScript.sha1, 1, _this.prefix + id, _this.limit, _this.interval, Date.now(), amount, function(err, res) {
            if (!err) {
                log.debug('rollinglimit: use success', {
                    id: id,
                    result: res
                });
                resolve(res);
                if (callback) {
                    callback(null, res);
                }
                return;
            }
            //handle errors
            //NOSCRIPT just means it hasn't been cached yet
            if (!(err instanceof Error) || err.message.indexOf('NOSCRIPT') === -1) {
                log.error('rollinglimit: error calling evalsh', {
                    id: id,
                    error: err
                });
                reject(err);
                if (callback) {
                    callback(err, 0);
                }
                return;
            }
            //noinspection JSLint
            _this.redis.eval(luaScript.script, 1, _this.prefix + id, _this.limit, _this.interval, Date.now(), amount, function(err, res) {
                if (err) {
                    log.error('rollinglimit: error calling eval', {
                        id: id,
                        error: err
                    });
                    reject(err);
                } else {
                    log.debug('rollinglimit: use success', {
                        id: id,
                        result: res
                    });
                    resolve(res);
                }
                if (callback) {
                    callback(err, res);
                }
            });
        });
    });
};

RollingLimit.prototype.fill = function(id, callback) {
    if (callback && typeof callback !== 'function') {
        throw new TypeError('callback must be a function');
    }
    log.debug('rollinglimit: fill called', {id: id});
    return new Promise(function(resolve, reject) {
        this.redis.zremrangebyrank(this.prefix + id, 0, -1, function(err, res) {
            if (err) {
                log.error('rollinglimit: error calling zremrangebyrank', {
                    id: id,
                    error: err
                });
                reject(err);
            } else {
                log.debug('rollinglimit: fill success', {
                    id: id,
                    result: res
                });
                resolve();
            }
            if (callback) {
                callback(err);
            }
        });
    }.bind(this));
};

module.exports = RollingLimit;
