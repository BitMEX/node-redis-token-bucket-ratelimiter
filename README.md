# node-redis-token-bucket-ratelimiter #

A rolling rate limit using Redis. Original idea from [Peter Hayes](https://engineering.classdojo.com/blog/2015/02/06/rolling-rate-limiter/).
Uses a lua script for atomic operations and to prevent blocked actions from substracting
from the bucket.

Compatible with Redis Cluster.

### Usage ###

```JS
var RollingLimit = require('redis-token-bucket-ratelimiter');
```

## RollingLimit Methods ##

### limiter = new RollingLimit(options) ###

Creates a new RollingLimit instance.

Options:
* `limit`: (required) maximum of allowed uses in `interval`
* `interval`: (required) millisecond duration for the `limit`
* `redis`: (required) an instance of [RedisClient](https://www.npmjs.com/package/redis)
* `prefix`: (optional) a string to prepend before `id` for each key
* `force`: (optional) a boolean to force an accept, but draining the bucket if necessary

### limiter.use(id: string): Promise ###
### limiter.use(id: string, amount?: number): Promise ###

Takes a token from the limit's bucket for `id` in redis and returns a promise with
the limit response object:
* `numLeft`: (number >= 0) the number of tokens left in the bucket
* `rejected`: (boolean) whether or not the request was rejected
* `retryDelta
* `amount`: the number of tokens to take from the bucket and defaults to `1`.

If you want to get the count of tokens left, send in an `amount` of `0`.

### static RateLimiter.stubLimit(max) ###

Synchronously returns a fake-but-complete response object, with the supplied max for a limit
