'use strict';
const Redis = require('ioredis');
const {makeTestSuite} = require('./_test-common');
const port = Number(process.env.PORT) || 6379;

const redisClient = new Redis({port});
redisClient.on('error', (e) => {
  console.error(`Error connecting to Redis. Did you start a local server on ${port}?`);
  console.error(e);
})
makeTestSuite('single client (ioredis)', redisClient, 0 /* lag */);
