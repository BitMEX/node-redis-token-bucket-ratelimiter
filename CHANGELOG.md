## Changelog ##

> Forked from redis-rolling-limit

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
