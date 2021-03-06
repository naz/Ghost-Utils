# Job Manager

A manager for jobs (aka tasks) that have to be performed asynchronously, optionally recurring, scheduled or one-off in their nature. The job queue is manage in memory without additional dependencies.

## Install

`npm install @tryghost/job-manager --save`

or

`yarn add @tryghost/job-manager`


## Usage

Below is a sample code to wire up job manger and initialize jobs:
```js
const JobManager = require('@tryghost/job-manager');

const logging = {
    info: console.log,
    warn: console.log,
    error: console.error
};

const jobManager = new JobManager(logging);

// register a job "function" with queued execution in parent event loop
jobManager.addJob(printWord(word) => console.log(word), 'hello');

// register a job "module" with queued execution in parent even loop
jobManager.addJob('./path/to/email-module.js', {email: 'send@here.com'});

// register recurring job which needs execution outside parent event loop
jobManager.scheduleJob('every 5 minutes', './path/to/jobs/check-emails.js', {}, 'email-checker');

// register recurring job with cron syntax running every 5 minutes
// job needs execution outside parent event loop
// for cron builder check https://crontab.guru/ (first value is seconds)
jobManager.scheduleJob('0 1/5 * * * *', './path/to/jobs/check-emails.js', {}, 'email-checker-cron');
```

For other examples of JobManager initialization check [test/examples](https://github.com/TryGhost/Ghost-Utils/tree/master/packages/job-manager/test/examples) directory.

### Job types and definitions

Job manager's instance accepts a "job" as a parameter in it's `addJob` and `scheduleJob` methods. Both methods should be used based on the nature of jobs they are going to run.

`addJob` method should be used to queue a "function" for execution which is not computationally intensive and contains small amount of asynchronous operations. When registering such job it should always be accounted that code will be executed on the caller's event loop/thread/process.

`scheduleJob` method should be used to register execution of a "worker" (script defined in a separate file) in the future or in recurring manner. Comparing to "function" jobs, **scheduled jobs are safer to execute as they are run on a dedicated thread**. Scheduled jobs *can* contain heavy computations or less safe to execute code, for example: statistical information processing, memory intensive computations, processing that requires blocking I/O operations etc. 

### Jobs

Jobs can be defined in multiple ways depending on the method they will be registered with.

Short, non-blocking, asap executed jobs - should come through `addJob` method. Those can be standard [JavaScript function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function) or a path to a module that exports a function as default.

Scheduled job can be registered through `scheduleJob` method. Jobs created this way are managed by [bree](https://github.com/breejs/bree) job scheduling library. For examples of job scripts check out [this section](https://github.com/breejs/bree#nodejs-email-queue-job-scheduling-example) of bree's documentation, test [job examples](https://github.com/TryGhost/Ghost-Utils/tree/master/packages/job-manager/test/jobs).

### Job rules of thumb
To prevent complications around failed job retries and and handling of specific job states here are some rules that should be followed for all scheduled jobs:
1. Jobs are **self contained** - meaning job manager should be able to run the job with the state information included within the job's parameters. Job script should look up for the rest of needed information from somewhere else, like a database, API, or file.
2. Jobs should be [idempotent](https://en.wikipedia.org/wiki/Idempotence) - consequent job executions should be safe.
3. Job **parameters** should be **kept to the minimum**. When passing large amounts of data around performance can suffer from slow JSON serialization. Also, storage size restrictions that can arise if there is a need to store parameters in the future.Job parameters should be kept to only information that is needed to retrieve the rest of information from somewhere else. For example, it's recommended to pass in only an *id* of the resource that could be fetched from the data storage during job execution or pass in a file path which could be read during execution.
4. Scheduled **job execution time should not overlap**. It's up to the registering service to assure job execution time does not ecceed time between subsequent scheduled jobs. For example, if job is scheduled to run every 5 minutes it should always run under 5 minutes, otherwise next scheduled job would fail to start.

### Offloaded (scheduled) jobs lifecycle

Offloaded (scheduled) jobs are running on dedicated worker threads which makes their lifecycle a bit different to "on the same event loop" jobs:
1. When **starting** a job it's only sharing ENV variables with it's parent process. The job itself is run on an independent JavaScript execution thread. The script has to re-initialize any modules it will use. For example it should take care of: model layer initialization, cache initialization, etc.
2. When **finishing** work in a job prefer to signal successful termination by sending 'done' message to the parent thread: `parentPort.postMessage('done')` ([example use](https://github.com/TryGhost/Ghost-Utils/blob/0e423f6c5c69b08d81d470f49de95654d8cc90e3/packages/job-manager/test/jobs/graceful.js#L33-L37)). Finishing work this way terminates the thread through [worker.terminate()]((https://nodejs.org/dist/latest-v14.x/docs/api/worker_threads.html#worker_threads_worker_terminate)), which logs termination in parent process and flushes any pipes opened in thread.
3. Jobs that have iterative nature, or need cleanup before interrupting work should allow for **graceful shutdown** by listening on `'cancel'` message coming from parent thread ([example use](https://github.com/TryGhost/Ghost-Utils/blob/0e423f6c5c69b08d81d470f49de95654d8cc90e3/packages/job-manager/test/jobs/graceful.js#L12-L16)).
4. When **exceptions occur** and expected outcome is to terminate current job, leave the exception unhandled allowing it to bubble up to the job manager. Unhandled exceptions [terminate current thread](https://nodejs.org/dist/latest-v14.x/docs/api/worker_threads.html#worker_threads_event_error) and allow for next scheduled job execution to happen.

For more nuances on job structure best practices check [bree documentation](https://github.com/breejs/bree#writing-jobs-with-promises-and-async-await).

### Job script quirks

⚠️ to ensure worker thread back compatibility and correct inter-thread communication use [btrheads](https://github.com/chjj/bthreads) polyfill instead of native [worker_threads](https://nodejs.org/api/worker_threads.html#worker_threads) module in job scripts.

Instead of: 
```js
const {isMainThread, parentPort} = require('worker_threads');
```
use 
```js
const {isMainThread, parentPort} = require('bthreads');
```

It should be possible to use native `worker_threads` module once Node v10 [hits EOL](https://nodejs.org/en/about/releases/) (2021-04-30).

## Develop

This is a mono repository, managed with [lerna](https://lernajs.io/).

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.


## Run

- `yarn dev`


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests




# Copyright & License 

Copyright (c) 2020 Ghost Foundation - Released under the [MIT license](LICENSE).
