# node-redis-token-bucket-ratelimiter #

A rolling rate limit using Redis. Original idea from [Peter Hayes](https://engineering.classdojo.com/blog/2015/02/06/rolling-rate-limiter/).
Uses a lua script for atomic operations and to prevent blocked actions from substracting
from the bucket.


Compatible with [ioredis](https://www.npmjs.com/package/ioredis) (including in Redis Cluster mode) and [node-redis](https://www.npmjs.com/package/ioredis) client.

### Usage

```js
const RollingLimit = require('redis-token-bucket-ratelimiter');
const Redis = require('ioredis');
const redisClient = new Redis({port});
const myAppVersion = require('./package.json').version;
const defaultLimiter = new RollingLimit({
  interval: 5000,
  limit: 3,
  redis: redisClient,
  prefix: `${myAppVersion}:`,
  force: false,
  allowLargerWithdrawal: false,
});
```

### How It Works

Token Bucket ratelimiters can be described as a bucket within which "tokens" are added at a constant rate. Every time a request is made, a token is removed from the bucket. If the bucket is empty, the request is rejected.

For instance, one might set a 60/1min request limit by instantiating a limiter like so:

```js
const requestLimiter = new RollingLimit({
  interval: 60000,
  limit: 60,
  redis: RedisClient
});
```

Then use it as middleware on each request:

```js
async function rateLimitMiddleware(req, res, next) {
  const id = getUserId(req);
  const limit = await requestLimiter.use(id);

  // Your max tokens
  res.set('X-RateLimit-Limit', String(limit.limit));
  // Remaining tokens; this continually refills
  res.set('X-RateLimit-Remaining', String(limit.remaining));
  // The time at which it's valid to do the same request again; this is almost always now()
  const retrySec = Math.ceil(limit.retryDelta / 1000);
  res.set(
    'X-RateLimit-Reset',
    String(Math.ceil(Date.now() / 1000) + retrySec)
  );

  if (limit.rejected) {
    res.set('Retry-After', String(retrySec));
    res.status(429).json({
      error: {
        message: `Rate limit exceeded, retry in ${retrySec} seconds.`,
        name: 'RateLimitError',
      },
    });
    return;
  }
  next();
}
```

## RollingLimit Types and Methods

### Types

```js
type RollingLimiterOptions = {
  // millisecond duration for the `limit`
  interval: number,
  // maximum of allowed uses in one rolling `interval`
  limit: number,
  // an ioredis or node-redis client instance
  redis: Object,
  // (optional) A string to prepend before `id` for each key
  // Useful for avoiding collisions between applications or versions of an application.
  // A trailing colon is optional and will be added if not present
  prefix?: string,
  // (optional) a boolean to force an accept, but draining the bucket if necessary
  // This allows the limiter to go negative. Use for instances where an action must be allowed,
  // but you still want to deduct from the limit.
  force?: boolean,
  // (optional) a boolean to allow withdrawals that are larger than the bucket size.
  // A larger withdrawal may only occur IFF the bucket is completely full. The bucket
  // will then be drained to a state where it has negative tokens. The next request must
  // then wait for the bucket to refill to an appropriate state
  allowLargerWithdrawal?: boolean,
};

type RollingLimiterResult = {
  limit: number,      // the limit passed into `RollingLimiterOptions` on this invocation
  remaining: number,  // the number of tokens left in the bucket. Can be negative with `force`
  rejected: boolean,  // `true` if the request was rejected, `false` otherwise
  retryDelta: number, // if rejected, milliseconds to wait before making the next request
                      // if not rejected, the milliseconds to wait before making a request
                      // of the same amount again
  forced: boolean,    // if `true`, `force` was on (see `RollingLimiterOptions`)
};
```

### Methods

#### `limiter = new RollingLimit(options: RollingLimiterOptions)`

Creates a new RollingLimit instance. See types above.

#### `limiter.use(id: string): Promise<RateLimitResponse>`
#### `limiter.use(id: string, amount?: number): Promise<RateLimitResponse>`

Takes a token from the limit's bucket for `id` in redis and returns a promise with
a `RollingLimiterResult` object.

If you want to get the count of tokens left, send in an `amount` of `0`.

#### `static RateLimiter.stubLimit(max): RateLimitResponse`

Synchronously returns a fake-but-complete response object, with the supplied max for a limit.
