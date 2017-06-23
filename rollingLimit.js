'use strict';
const luaScript = require('./lua/rollingLimit.lua.json');
const promisify = require('util.promisify');

class RollingLimit {

  constructor(options) {
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
    this.prefix = options.prefix || 'limit:';
    if(!/:$/.test(this.prefix)) this.prefix += ':';
    this.force = options.force ? 'true' : 'false';
    if (!this.redis.evalshaAsync) {
      this.redis.evalshaAsync = promisify(this.redis.evalsha).bind(this.redis);
      this.redis.evalAsync = promisify(this.redis.eval).bind(this.redis);
    }
  }

  use(id, amount){
    return Promise.resolve()
    .then(() => {
      if (amount == null) amount = 1;
      if (amount < 0) throw new Error('amount must be >= 0');
      if (amount > this.limit) throw new Error(`amount must be < limit (${this.limit})`);

      const redisKeysAndArgs = [
        1,                // We're sending 1 KEY
        this.prefix + id, // KEYS[1]
        this.limit,       // ARGV[1]
        this.interval,    // ARGV[2]
        Date.now(),       // ARGV[3]
        amount,           // ARGV[4]
        this.force        // ARGV[5]
      ];

      return this.redis.evalshaAsync(luaScript.sha1, ...redisKeysAndArgs)
      .catch((err) => {
        if (err instanceof Error && err.message.includes('NOSCRIPT')) {
          // Script is missing, invoke again while providing the entire script
          return this.redis.evalAsync(luaScript.script, ...redisKeysAndArgs);
        }
        // Other error
        throw err;
      })
      .then((res) => {
        return {
          limit:      this.limit,
          remaining:  res[0],
          rejected:   Boolean(res[1]),
          retryDelta: res[2],
          forced:     Boolean(res[3])
        };
      });
    });
  }

  static stubLimit(max){
    if(max == null) max = Infinity;

    return {
      limit: max,
      remaining: max,
      rejected: false,
      forced: true,
      retryDelta: 0
    };
  }
}

module.exports = RollingLimit;
