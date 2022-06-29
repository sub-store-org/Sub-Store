class BaseError {
    constructor(code, message, details) {
        this.message = message;
        this.details = details;
    }
}

export class InternalServerError extends BaseError {
    constructor(code, message, details) {
        super(code, message, details);
        this.type = 'InternalServerError';
    }
}

export class ResourceNotFoundError extends BaseError {
    constructor(code, message, details) {
        super(code, message, details);
        this.type = 'ResourceNotFoundError';
    }
}

export class NetworkError extends BaseError {
    constructor(code, message, details) {
        super(code, message, details);
        this.type = 'NetworkError';
    }
}
