const fs = require('fs'),
    sha1 = require('sha1'),
    filename = process.argv[2];

const contents = fs.readFileSync(filename, {encoding: 'utf8'});
const result = {
    script: contents,
    sha1: sha1(contents)
};
fs.writeFileSync(filename + '.json', JSON.stringify(result));
process.exit(0);
