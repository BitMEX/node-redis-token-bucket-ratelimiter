'use strict';
const RollingLimit = require('../rollingLimit.js');
const assert = require('assert');
const sinon = require('sinon');
const promisify = require('util').promisify;

function makeTestSuite(name, redisClient, lag) {
  function assertBetween(low, high, number) {
    assert((low + lag / 2) <= number && number <= (high + lag));
  }

  let prefix;

  describe(`${name} - Ratelimiter`, () => {
    let defaultLimiter;

    before(() => {
      prefix = 'node-redis-rolling-limit-test-' + Date.now();
      defaultLimiter = new RollingLimit({
        interval: 5000,
        limit: 3,
        redis: redisClient,
        prefix: prefix
      });
    });

    after(() => {
      redisClient.quit();
    });


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
        interval: 250 + lag,
        limit: 3,
        redis: redisClient,
        prefix: prefix
      });

      if (typeof redisClient.pttlAsync === 'undefined') {
        redisClient.pttlAsync = promisify(redisClient.pttl).bind(redisClient);
      }

      return limiter.use('ttl')
      .then((res) => {
        assert.equal(res.remaining, 2);
        return redisClient.pttlAsync(prefix + ':{ttl}:V')
        .then((res) => {
          assertBetween(50, 250, res);
        })
      })
      .then(() => delay(500 + lag))
      .then(() => limiter.use('ttl'))
      .then((res) => {
        // Unchanged because it has reset
        assert.equal(res.remaining, 2);
        return redisClient.pttlAsync(prefix + ':{ttl}:V')
        .then((res) => {
          assertBetween(50, 250, res);
        })
      });
    });

    it('Slowly refills limit', () => {
      const limiter = new RollingLimit({
        interval: 500 + lag,
        limit: 2,
        redis: redisClient,
        prefix: prefix
      });
      const NAME = 'rolling100';

      return limiter.use(NAME, 2)
      .then((res) => {
        assert.equal(res.rejected, false);
        assert.equal(res.remaining, 0);
        assertBetween(400, 500, res.retryDelta);
      })
      .then(() => delay(150))
      .then(() => limiter.use(NAME, 1))
      .then((res) => {
        assert.equal(res.rejected, true);
        assertBetween(0, 100, res.retryDelta);
      })
      .then(() => delay(100))
      .then(() => limiter.use(NAME, 1))
      .then((res) => {
        assert.equal(res.rejected, false);
        assert.equal(res.remaining, 0);
        assertBetween(150, 250, res.retryDelta);
      })
      .then(() => delay(600))
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

    it('Does not deduct when it should add if clock skews', () => {
      const limiter = new RollingLimit({
        interval: 500 + lag,
        limit: 100,
        redis: redisClient,
        prefix: prefix
      });
      const NAME = 'clockSkewTest';

      // Set the date into the future
      const clock = sinon.useFakeTimers({
        now: Date.now() + 300,
        // Exclude 'setImmediate' as it is used by native promises
        toFake: ['setTimeout', 'setInterval', 'Date', 'nextTick']
      });

      return limiter.use(NAME, 1)
      .then((res) => {
        assert.equal(res.remaining, 99);
        // Restore the clock; this should not deduct more tokens
        clock.restore();
        return limiter.use(NAME, 1)
      })
      .then((res) => {
        assert.equal(res.remaining, 98);
        assert.equal(res.rejected, false);
      });
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  makeTestSuite,
};
