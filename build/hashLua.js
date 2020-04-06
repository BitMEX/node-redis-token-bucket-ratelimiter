const fs = require('fs');
const crypto = require('crypto');
const filename = process.argv[2];
const hash = crypto.createHash('sha1');

const contents = fs.readFileSync(filename, {encoding: 'utf8'});
const result = {
    script: contents,
    sha1: hash.update(contents).digest('hex'),
};
fs.writeFileSync(filename + '.json', JSON.stringify(result));
process.exit(0);
