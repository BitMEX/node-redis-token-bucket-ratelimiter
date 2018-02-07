'use strict';
const RollingLimit = require('../rollingLimit.js');
const redis = require('redis');
const Promise = require('bluebird');
const prefix = 'node-redis-rolling-limit-test-' + Date.now();
const assert = require('power-assert');
let redisClient;
let defaultLimiter;

before((done) => {
  redisClient = redis.createClient();
  Promise.promisifyAll(redisClient);
  redisClient.on('ready', function() {
    defaultLimiter = new RollingLimit({
      interval: 5000,
      limit: 3,
      redis: redisClient,
      prefix: prefix
    });
    done();
  });
  redisClient.on('error', (e) => {
    console.error('Error connecting to Redis. Did you start a local server on 6379?');
    console.error(e);
  })
})

after(() => {
  redisClient.end();
});

describe('Ratelimiter', () => {

  it('Rejects when out of tokens', () => {
    let numLeft = 3;
    // 3 req per 5000ms
    return defaultLimiter.use('use1')
    .then(function consumeReq(res) {
      if (numLeft) {
        assert.equal(res.remaining, numLeft - 1);
        assert.equal(res.rejected, false);
        numLeft--;
        return defaultLimiter.use('use1').then(consumeReq);
      }
      return res;
    })
    .then((res) => {
      assert.equal(res.remaining, 0);
      assert.equal(res.rejected, true);
    });
  });

  it('Expires the keys after interval ms', () => {
    const limiter = new RollingLimit({
      interval: 250,
      limit: 3,
      redis: redisClient,
      prefix: prefix
    });

    return limiter.use('ttl')
    .then((res) => {
      assert(res.remaining === 2);
      return redisClient.pttlAsync(prefix + ':{ttl}:V')
      .then((res) => {
        assert(50 < res && res <= 250);
      })
    })
    .then(() => Promise.delay(500))
    .then(() => limiter.use('ttl'))
    .then((res) => {
      assert(res.remaining === 2);
      return redisClient.pttlAsync(prefix + ':{ttl}:V')
      .then((res) => {
        assert(50 < res && res <= 250);
      })
    });
  });

  it('Slowly refills limit', () => {
    const limiter = new RollingLimit({
      interval: 500,
      limit: 2,
      redis: redisClient,
      prefix: prefix
    });
    const NAME = 'rolling100';

    return limiter.use(NAME, 2)
    .then((res) => {
      assert.equal(res.rejected, false);
      assert.equal(res.remaining, 0);
      assert(400 < res.retryDelta && res.retryDelta <= 500);
    })
    .then(() => Promise.delay(150))
    .then(() => limiter.use(NAME, 1))
    .then((res) => {
      assert.equal(res.rejected, true);
      assert(0 < res.retryDelta && res.retryDelta <= 100);
    })
    .then(() => Promise.delay(100))
    .then(() => limiter.use(NAME, 1))
    .then((res) => {
      assert.equal(res.rejected, false);
      assert.equal(res.remaining, 0);
      assert(150 < res.retryDelta && res.retryDelta <= 250);
    })
    .then(() => Promise.delay(600))
    .then(() => limiter.use(NAME, 1))
    .then((res) => {
      assert.equal(res.remaining, 1);
      assert.equal(res.rejected, false);
    });
  });

  it('Deduction > 1', () => {
    return defaultLimiter.use('useMultiple', 3)
    .then((res) => {
      assert.equal(res.remaining, 0);
      assert.equal(res.rejected, false);
    })
  });

  it('Deduction more than limit', () => {
    return defaultLimiter.use('use4', 4)
    .then(() => assert(false))
    .catch((e) => {
      assert(e instanceof Error);
      assert(/amount must be < limit/i.test(e.message));
    })
  });

  it('Deduction of zero (stub deduction)', () => {
    return defaultLimiter.use('use0', 3)
    .then((res) => {
      assert.equal(res.remaining, 0);
      return defaultLimiter.use('use0', 0);
    })
    .then((res) => {
      assert.equal(res.rejected, false);
      assert.equal(res.retryDelta, 0);
    });
  });
});
