'use strict';
const luaScript = require('./lua/rollingLimit.lua.json');

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
    if (options.allowLargerWithdrawal && typeof options.allowLargerWithdrawal !== 'boolean') {
      throw new TypeError('allowLargerWithdrawal must be a boolean');
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
    this.allowLargerWithdrawal = !!options.allowLargerWithdrawal;
    if (!this.redis.evalshaAsync) {
      if (this.redis.Promise) {
        // ioredis; already promisified
        this.redis.evalshaAsync = this.redis.evalsha;
        this.redis.evalAsync = this.redis.eval;
      } else {
        const promisify = require('util').promisify;
        this.redis.evalshaAsync = promisify(this.redis.evalsha).bind(this.redis);
        this.redis.evalAsync = promisify(this.redis.eval).bind(this.redis);
      }
    }
  }

  use(id, amount){
    return Promise.resolve()
    .then(() => {
      if (amount == null) amount = 1;
      if (amount < 0) throw new Error('amount must be >= 0');
      if (amount > this.limit && !this.allowLargerWithdrawal) throw new Error(`amount must be < limit (${this.limit})`);

      // Note extra curly braces (hash tag) which are needed for Cluster hash slotting
      const keyBase = `${this.prefix}{${id}}`;
      const valueKey = `${keyBase}:V`;
      const timestampKey = `${keyBase}:T`;

      // A note on redis EVAL:
      // It may seem nosensical for us to specify keys separate from args, but this is a way of letting
      // Redis know what keys we intend to operate on. By doing so, it can work with Cluster. From the docs:
      //
      // > All Redis commands must be analyzed before execution to determine which keys the command will operate on.
      // > In order for this to be true for EVAL, keys must be passed explicitly. This is useful in many ways,
      // > but especially to make sure Redis Cluster can forward your request to the appropriate cluster node.
      //
      // What is not stated, and is necessary to know, is that we *must* ensure all keys we operate on
      // are on the same server by using hash tags. All this key passing does is allow Redis to do is fail properly.
      //
      // https://redis.io/commands/eval
      //
      const redisKeysAndArgs = [
        2,                // We're sending 2 KEYs
        valueKey,         // KEYS[1]
        timestampKey,     // KEYS[2]
        this.limit,       // ARGV[1]
        this.interval,    // ARGV[2]
        amount,           // ARGV[3]
        this.force,       // ARGV[4]
        this.allowLargerWithdrawal ? 'true' : 'false' // ARGV[5]
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
