class BaseError {
    constructor(code, message, details) {
        this.code = code;
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

export class RequestInvalidError extends BaseError {
    constructor(code, message, details) {
        super(code, message, details);
        this.type = 'RequestInvalidError';
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
