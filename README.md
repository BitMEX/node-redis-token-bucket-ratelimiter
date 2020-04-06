# node-redis-token-bucket-ratelimiter #

A rolling rate limit using Redis. Original idea from [Peter Hayes](https://engineering.classdojo.com/blog/2015/02/06/rolling-rate-limiter/).
Uses a lua script for atomic operations and to prevent blocked actions from substracting
from the bucket.

Compatible with Redis Cluster.

### Usage ###

```JS
const RollingLimit = require('redis-token-bucket-ratelimiter');
const Redis = require('ioredis');
const redisClient = new Redis({port});
const defaultLimiter = new RollingLimit({
  interval: 5000,
  limit: 3,
  redis: redisClient,
});
```

## RollingLimit Methods ##

### limiter = new RollingLimit(options) ###

Creates a new RollingLimit instance.

Options:
* `limit`: (required) maximum of allowed uses in `interval`
* `interval`: (required) millisecond duration for the `limit`
* `redis`: (required) an [ioredis](https://www.npmjs.com/package/ioredis) or [node-redis](https://www.npmjs.com/package/ioredis) client instance
* `prefix`: (optional) a string to prepend before `id` for each key
  * Useful for avoiding collisions between applications or versions of an application
* `force`: (optional) a boolean to force an accept, but draining the bucket if necessary
  * This allows the limiter to go negative. Use for instances where an action must be allowed, but you still want to deduct from the limit.

### limiter.use(id: string): Promise ###
### limiter.use(id: string, amount?: number): Promise ###

Takes a token from the limit's bucket for `id` in redis and returns a promise with
the limit response object:
* `numLeft`: (number >= 0) the number of tokens left in the bucket
* `rejected`: (boolean) whether or not the request was rejected
* `retryDelta`
* `amount`: the number of tokens to take from the bucket and defaults to `1`.

If you want to get the count of tokens left, send in an `amount` of `0`.

### static RateLimiter.stubLimit(max) ###

Synchronously returns a fake-but-complete response object, with the supplied max for a limit
