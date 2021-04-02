import * as errors from '@tryghost/errors';
import {MaxLimit, FlagLimit} from './limit';
import config from './config';
import _ from 'lodash';

export class LimitService {
    constructor() {
        this.limits = {};
    }

    loadLimits({limits, helpLink, db}) {
        Object.keys(limits).forEach((name) => {
            name = _.camelCase(name);

            if (config[name]) {
                let limitConfig = _.merge({}, limits[name], config[name]);

                if (_.has(limitConfig, 'max')) {
                    this.limits[name] = new MaxLimit({name: name, config: limitConfig, helpLink, db});
                } else {
                    this.limits[name] = new FlagLimit({name: name, config: limitConfig, helpLink});
                }
            }
        });
    }

    isLimited(limitName) {
        return !!this.limits[_.camelCase(limitName)];
    }

    async checkIsOverLimit(limitName) {
        if (!this.isLimited(limitName)) {
            return;
        }

        try {
            await this.limits[limitName].errorIfIsOverLimit();
            return false;
        } catch (error) {
            if (error instanceof errors.HostLimitError) {
                return true;
            }
        }
    }

    async checkWouldGoOverLimit(limitName) {
        if (!this.isLimited(limitName)) {
            return;
        }

        try {
            await this.limits[limitName].errorIfWouldGoOverLimit();
            return false;
        } catch (error) {
            if (error instanceof errors.HostLimitError) {
                return true;
            }
        }
    }

    async errorIfIsOverLimit(limitName) {
        if (!this.isLimited(limitName)) {
            return;
        }

        await this.limits[limitName].errorIfIsOverLimit();
    }

    async errorIfWouldGoOverLimit(limitName) {
        if (!this.isLimited(limitName)) {
            return;
        }

        await this.limits[limitName].errorIfWouldGoOverLimit();
    }
}
