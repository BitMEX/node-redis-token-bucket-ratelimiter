var fs = require('fs'),
    sha1 = require('sha1'),
    filename = process.argv[2];

fs.readFile(filename, {encoding: 'utf8'}, function(err, contents) {
    if (err) {
        throw err;
    }
    var result = {
        script: contents,
        sha1: sha1(contents)
    };
    fs.writeFile(filename + '.json', JSON.stringify(result), function(err) {
        if (err) {
            throw err;
        }
        process.exit(0);
    });
});
