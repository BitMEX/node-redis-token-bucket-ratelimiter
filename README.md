# redis-rolling-limit #

A rolling rate limit using Redis. Original idea from [Peter Hayes](https://engineering.classdojo.com/blog/2015/02/06/rolling-rate-limiter/).
Uses a lua script for atomic operations and to prevent blocked actions from substracting
from the bucket.

### Usage ###

```JS
var RollingLimit = require('redis-rolling-limit');
```

## RollingLimit Methods ##

### limiter = new RollingLimit(options) ###

Creates a new RollingLimit instance.

Options:
* `limit`: (required) maximum of allowed uses in `interval`
* `interval`: (required) millisecond duration for the `limit`
* `redis`: (required) an instance of [RedisClient](https://www.npmjs.com/package/redis)
* `prefix`: (optional) a string to prepend before `id` for each key

### limiter.use(id, callback) ###
### limiter.use(id, amount, callback) ###

Takes a token from the limit's bucket for `id` in redis and calls `callback` with
(error, numLeft). `numLeft` is the number of tokens left in the bucket. `amount`
is the number of tokens to take from the bucket and defaults to `1`. If you wanted
to get the count of tokens left, send in an `amount` of `0`.

Returns a promise that can be used instead of the callback.

### limiter.fill(id, callback) ###

Re-fills the bucket for `id` in redis to max capacity. `callback` is called with
(error). Returns a promise that can be used instead of the callback.
