# redis-rolling-limit #

Implement a rolling rate limit in redis

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

Takes a token from the limit's bucket for `id` in redis and calls `callback` with
(error, numLeft). `numLeft` is the number of tokens left in the bucket.

### limiter.fill(id, callback) ###

Re-fills the bucket for `id` in redis to max capacity. `callback` is called with
(error).
