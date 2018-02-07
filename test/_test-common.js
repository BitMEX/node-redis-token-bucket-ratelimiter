'use strict';
const RollingLimit = require('../rollingLimit.js');
const Promise = require('bluebird');
const prefix = 'node-redis-rolling-limit-test-' + Date.now();
const assert = require('power-assert');

function makeTestSuite(name, redisClient, lag) {
  function assertBetween(low, high, number) {
    assert((low + lag / 2) <= number && number <= (high + lag));
  }

  describe(`${name} - Ratelimiter`, () => {
    let defaultLimiter;

    before(() => {
      console.log('redis ready', name);
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

      return limiter.use('ttl')
      .then((res) => {
        assert(res.remaining === 2);
        return redisClient.pttlAsync(prefix + ':{ttl}:V')
        .then((res) => {
          assertBetween(50, 250, res);
        })
      })
      .then(() => Promise.delay(500 + lag))
      .then(() => limiter.use('ttl'))
      .then((res) => {
        assert(res.remaining === 2);
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
      .then(() => Promise.delay(150))
      .then(() => limiter.use(NAME, 1))
      .then((res) => {
        assert.equal(res.rejected, true);
        assertBetween(0, 100, res.retryDelta);
      })
      .then(() => Promise.delay(100))
      .then(() => limiter.use(NAME, 1))
      .then((res) => {
        assert.equal(res.rejected, false);
        assert.equal(res.remaining, 0);
        assertBetween(150, 250, res.retryDelta);
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
}

module.exports = {
  makeTestSuite,
};
