import _ from 'lodash';

export class Result {
    constructor(proxy) {
        this.proxy = proxy;
        this.output = [];
    }

    append(data) {
        this.output.push(data);
    }

    appendIfPresent(data, attr) {
        if (typeof _.get(this.proxy, attr) !== 'undefined') {
            this.append(data);
        }
    }

    toString() {
        return this.output.join('');
    }
}
