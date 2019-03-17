const fs = require('fs');
const os = require('os');
const _ = require('lodash');
const Promise = require('bluebird');
const requestPromise = require('request-promise');
const request = require('request');

const localUtils = require('./utils');

module.exports.create = (options = {}) => {
    let draft = true;
    let prerelease = false;
    let filterEmojiCommits = true;

    localUtils.checkMissingOptions(options,
        'changelogPath',
        'github',
        'github.username',
        'github.token',
        'userAgent',
        'uri',
        'tagName',
        'releaseName'
    );

    if (options.hasOwnProperty('draft')) {
        draft = options.draft;
    }

    if (options.hasOwnProperty('prerelease')) {
        prerelease = options.prerelease;
    }

    if (options.hasOwnProperty('filterEmojiCommits')) {
        filterEmojiCommits = options.filterEmojiCommits;
    }

    let body = [];
    let changelog = fs.readFileSync(options.changelogPath).toString('utf8').split(os.EOL);

    // @NOTE: optional array of string lines, which we pre-pend
    if (options.hasOwnProperty('content') && _.isArray(options.content)) {
        body = body.concat(options.content);
    }

    if (filterEmojiCommits) {
        changelog = localUtils.filterEmojiCommits(changelog);
    }

    body = body.concat(changelog);

    // @NOTE: Add casper changelog if present
    if (options.hasOwnProperty('casper') && _.isObject(options.casper) && options.casper.changelogPath) {
        let casperChangelog = fs.readFileSync(options.casper.changelogPath).toString('utf8').split(os.EOL);
        casperChangelog = localUtils.filterEmojiCommits(casperChangelog);
        body.push('');
        body.push(`Casper (the default theme) has been upgraded to ${options.casper.version}:`);
        body = body.concat(casperChangelog);
    }

    // CASE: clean before upload
    body = body.filter((item) => {
        return item !== undefined;
    });

    if (options.gistUrl) {
        body.push('');
        body.push('You can see the [full change log](' + options.gistUrl + ') for the details of every change included in this release.');
    }

    const auth = 'Basic ' + new Buffer(options.github.username + ':' + options.github.token).toString('base64');

    const reqOptions = {
        uri: options.uri,
        headers: {
            'User-Agent': options.userAgent,
            Authorization: auth
        },
        method: 'POST',
        body: {
            tag_name: options.tagName,
            target_commitish: 'master',
            name: options.releaseName,
            body: body.join(os.EOL),
            draft: draft,
            prerelease: prerelease
        },
        json: true,
        resolveWithFullResponse: true
    };

    return requestPromise(reqOptions)
        .then((response) => {
            return {
                id: response.body.id,
                releaseUrl: response.body.html_url,
                uploadUrl: response.body.upload_url
            };
        });
};

module.exports.uploadZip = (options = {}) => {
    localUtils.checkMissingOptions(options,
        'zipPath',
        'github',
        'github.username',
        'github.token',
        'userAgent',
        'uri'
    );

    const auth = 'Basic ' + new Buffer(options.github.username + ':' + options.github.token).toString('base64');
    const stats = fs.statSync(options.zipPath);

    const reqOptions = {
        uri: options.uri,
        headers: {
            'User-Agent': options.userAgent,
            Authorization: auth,
            'Content-Type': 'application/zip',
            'Content-Length': stats.size
        },
        method: 'POST',
        json: true,
        resolveWithFullResponse: true
    };

    return new Promise((resolve, reject) => {
        fs.createReadStream(options.zipPath)
            .on('error', reject)
            .pipe(request.post(reqOptions, (err, res) => {
                if (err) {
                    return reject(err);
                }

                resolve({
                    downloadUrl: res.body.browser_download_url
                });
            }));
    });
};

module.exports.get = (options = {}) => {
    localUtils.checkMissingOptions(options,
        'userAgent',
        'uri'
    );

    const reqOptions = {
        uri: options.uri,
        headers: {
            'User-Agent': options.userAgent
        },
        method: 'GET',
        json: true
    };

    return requestPromise(reqOptions)
        .then((response) => {
            return response;
        });
};