const { createClient } = require("redis4");
const { makeTestSuite } = require('./_test-common.js');

const port = Number(process.env.PORT) || 6379;

const redisClient = createClient({
  socket: { port },
});

redisClient.on('error', (e) => {
  console.error(`Error connecting to Redis (@4). Did you start a local server on ${port}?`);
  console.error(e);
});

redisClient.connect().then(() => {
  makeTestSuite('single client (node-redis@4)', redisClient, 0 /* lag */);
});
