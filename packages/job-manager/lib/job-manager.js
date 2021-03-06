const path = require('path');
const fastq = require('fastq');
const later = require('@breejs/later');
const Bree = require('bree');
const pWaitFor = require('p-wait-for');
const errors = require('@tryghost/errors');
const isCronExpression = require('./is-cron-expression');
const assembleBreeJob = require('./assemble-bree-job');

const worker = async (task, callback) => {
    try {
        let result = await task();
        callback(null, result);
    } catch (error) {
        callback(error);
    }
};

const handler = (error, result) => {
    if (error) {
        // TODO: this handler should not be throwing as this blocks the queue
        // throw error;
    }
    // Can potentially standardise the result here
    return result;
};

class JobManager {
    constructor(logging) {
        this.queue = fastq(this, worker, 1);

        this.bree = new Bree({
            root: false, // set this to `false` to prevent requiring a root directory of jobs
            hasSeconds: true, // precission is needed to avoid task ovelaps after immidiate execution
            outputWorkerMetadata: true,
            logger: logging
        });

        this.logging = logging;
    }

    /**
     * Adds job to queue in current even loop
     *
     * @param {Function|String} job - function or path to a module defining a job
     * @param {Object} [data] - data to be passed into the job
     */
    addJob(job, data) {
        this.logging.info('Adding one off job to the queue');

        this.queue.push(async () => {
            try {
                if (typeof job === 'function') {
                    await job(data);
                } else {
                    await require(job)(data);
                }
            } catch (err) {
                // NOTE: each job should be written in a safe way and handle all errors internally
                //       if the error is caught here jobs implementaton should be changed
                this.logging.error(new errors.IgnitionError({
                    level: 'critical',
                    errorType: 'UnhandledJobError',
                    message: 'Processed job threw an unhandled error',
                    context: (typeof job === 'function') ? 'function' : job,
                    err
                }));

                throw err;
            }
        }, handler);
    }

    /**
     * Schedules recuring job offloaded to per-job event-loop (thread or a process)
     *
     * @param {String | Date} at - Date, cron or human readable schedule format
     * @param {Function|String} job - function or path to a module defining a job
     * @param {Object} [data] - data to be passed into the job
     * @param {String} [name] - job name
     */
    scheduleJob(at, job, data, name) {
        let schedule;

        if (!name) {
            if (typeof job === 'string') {
                name = path.parse(job).name;
            } else {
                throw new Error('Name parameter should be present if job is a function');
            }
        }

        if (!(at instanceof Date)) {
            if (isCronExpression(at)) {
                schedule = later.parse.cron(at, true);
            } else {
                schedule = later.parse.text(at);
            }

            if ((schedule.error && schedule.error !== -1) || schedule.schedules.length === 0) {
                throw new Error('Invalid schedule format');
            }

            this.logging.info(`Scheduling job ${name} at ${at}. Next run on: ${later.schedule(schedule).next()}`);
        } else {
            this.logging.info(`Scheduling job ${name} at ${at}`);
        }

        const breeJob = assembleBreeJob(at, job, data, name);
        this.bree.add(breeJob);
        return this.bree.start(name);
    }

    /**
     * @param {import('p-wait-for').Options} [options]
     */
    async shutdown(options) {
        await this.bree.stop();

        if (this.queue.idle()) {
            return;
        }

        this.logging.warn('Waiting for busy job queue');

        await pWaitFor(() => this.queue.idle() === true, options);

        this.logging.warn('Job queue finished');
    }
}

module.exports = JobManager;
