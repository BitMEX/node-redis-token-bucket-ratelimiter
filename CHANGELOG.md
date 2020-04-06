## Changelog ##

> Forked from redis-rolling-limit

### 0.5.0 ###
* Remove util.promisify polyfill as ioredis supports promises natively
  * If you're still using `node-redis`, `util.promisify` will be required and you must upgrade to Node >= 8.
* Remove unused dependencies
* Add node-redis test

### 0.4.0 ###
* Fix depletion on clock skew
 - If one server's clock was significantly ahead of another, we could end up subtracting tokens when
   we meant to add them.

### 0.3.0 ###
* Use hash tags in keys for compatibility with Redis Cluster

### 0.2.0 ###
* Internal re-implementation using Promises

### 0.1.0 ###
* Re-implementation as token bucket limiter
