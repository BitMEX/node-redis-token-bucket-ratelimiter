const luaScript = require('./lua/rollingLimit.lua.json');

class RollingLimit {

  constructor(options){
    
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
    if (options.prefix) {
      if(typeof options.prefix !== 'string') {
        throw new TypeError('prefix must be a string');
      }
      
      if(!/:$/.test(options.prefix)) options.prefix += ':';
    }

    this.interval = options.interval;
    this.limit = options.limit;
    this.redis = options.redis;
    this.prefix = options.prefix || 'limit:';
    this.force = options.force ? 'true' : 'false';
  }
  
  use(id, amount){
    
    if (amount === undefined) amount = 1;
    
    if (amount < 0) return Promise.reject(new Error('amount must be >= 0'));
    if (amount > this.limit) return Promise.reject(new Error(`amount must be < limit (${this.limit})`));
    
    return new Promise((resolve, reject) => {
      
      const success = res => {
        resolve({
          limit:      this.limit,
          remaining:  res[0],
          rejected:   Boolean(res[1]),
          retryDelta: res[2],
          forced:     Boolean(res[3])
        });
      };

      const redisKeysAndArgs = [
        1,                // We're sending 1 KEY
        this.prefix + id, // KEYS[1]
        this.limit,       // ARGV[1]
        this.interval,    // ARGV[2]
        Date.now(),       // ARGV[3]
        amount,           // ARGV[4]
        this.force        // ARGV[5]
      ];
      
      this.redis.evalsha(luaScript.sha1, ...redisKeysAndArgs, (err, res) => {
        if (!err) success(res);
        else if (err instanceof Error && err.message.includes('NOSCRIPT')) {
          // Script is missing, invoke again while providing the entire script
          this.redis.eval(luaScript.script, ...redisKeysAndArgs, (err, res) => {
            if (err) reject(err);
            else success(res);
          });
        }
        else reject(err); // All other errors
      });
      
    });
  };
  
  static stubLimit(max){
    
    if(max === undefined) max = Infinity;
    
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
