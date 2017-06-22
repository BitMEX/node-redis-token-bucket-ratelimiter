const util = require('util');

const luaScript = require('./lua/rollingLimit.lua.json');

const RollingLimit = function (options) {
  
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
  if (!options.redis || typeof options.redis.eval !== 'function') {
    throw new TypeError('redis must be an instance of RedisClient');
  }
  if (options.force && typeof options.force !== 'boolean') {
    throw new TypeError('force must be a boolean');
  }
  if (options.prefix && typeof options.prefix !== 'string') {
    throw new TypeError('prefix must be a string');
  }
  
  this.interval = options.interval;
  this.limit = options.limit;
  this.redis = options.redis;
  this.prefix = `${options.prefix}limit:`;
  this.force = options.force ? "true" : "false";
}

RollingLimit.prototype.use = function(id, amount) {
  const _this = this;
  
  if (amount === undefined) amount = 1;
  
  if (amount < 0) return Promise.reject(new Error('amount must be >= 0'));
  if (amount > this.limit) return Promise.reject(new Error(`amount must be < limit (${this.limit})`));
  
  return new Promise(function(resolve, reject) {
    
    const success = function(res){
      res = {
        limit: _this.limit,
        remaining: res[0],
        rejected: Boolean(res[1]),
        retryDelta: res[2],
        forced: Boolean(res[3]),
      };
      resolve(res);
    };
    
    _this.redis.evalsha(luaScript.sha1, 1, _this.prefix + id, _this.limit, _this.interval, Date.now(), amount, _this.force, function(err, res) {
      if (!err) success(res);
      else if (err instanceof Error && err.message.includes('NOSCRIPT')) {
        // Script is missing, invoke again while providing the entire script
        _this.redis.eval(luaScript.script, 1, _this.prefix + id, _this.limit, _this.interval, Date.now(), amount, _this.force, function(err, res) {
          if (err) reject(err);
          else success(res);
        });
      }
      else{
        // All other errors
        reject(err);
      }
    });
    
  });
};

RollingLimit.stubLimit = function (max) {
  
  if(max === undefined) max = Infinity;
  
  return {
    limit: max,
    remaining: max,
    rejected: false,
    forced: true,
    retryDelta: 0,
  };
}

module.exports = RollingLimit;
