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
    if (options.limit <= 0) {
        throw new Error('limit must be > 0');
    }
    //noinspection JSLint
    if (!options.redis || typeof options.redis.eval !== 'function') {
        throw new TypeError('redis must be an instance of RedisClient');
    }
    if (options.prefix && typeof options.prefix !== 'string') {
        throw new TypeError('prefix must be a string');
    }
    if (options.force && typeof options.force !== 'boolean') {
        throw new TypeError('force must be a boolean');
    }
  
    this.interval = options.interval;
    this.limit = options.limit;
    this.redis = options.redis;
    this.prefix = options.prefix || '';
    this.force = options.force ? "true" : "false";
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
    if (amount < 0) {
        throw new Error('amount must be >= 0');
    }
    if (amount > this.limit) {
        throw new Error(`amount must be < limit (${this.limit})`);
    }

    if(!callback) callback = function(){};

    log.debug('rollinglimit: use called', {id: id, amount: amount});
    return new Promise(function(resolve, reject) {

        const success = function(res){
                          log.debug('rollinglimit: use success', { id: id,
                                                                   result: res
                                                                 });
                          res = { remaining: res[0],
                                  rejected: !!res[1],
                                  retryDelta: res[2],
                                  fillDelta: res[3],
                                  forced: !!res[4]
                                };
                          resolve(res);
                          callback(null, res);
                        };

        const error = function(err, message){
                          log.error(message, { id: id,
                                               error: err
                                             });
                          reject(err);
                          callback(err);
                      };

        _this.redis.evalsha(luaScript.sha1, 1, _this.prefix + id, _this.limit, _this.interval, Date.now(), amount, _this.force, function(err, res) {
            if (!err) success(res);
            else if (!(err instanceof Error) || err.message.indexOf('NOSCRIPT') === -1) {
                error(err, 'rollinglimit: error calling evalsha');
            }
            else {
                //noinspection JSLint
                _this.redis.eval(luaScript.script, 1, _this.prefix + id, _this.limit, _this.interval, Date.now(), amount, _this.force, function(err, res) {
                    if (err) error(err, 'rollinglimit: error calling eval');
                    else     success(res);
                });
            }
        });
    });
};

module.exports = RollingLimit;
