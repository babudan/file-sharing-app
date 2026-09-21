export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string = "error",
  ) {
    super(message);
  }
}

export function notFound(message = "Not found"): HttpError {
  return new HttpError(404, message, "not_found");
}

export function forbidden(message = "Forbidden"): HttpError {
  return new HttpError(403, message, "forbidden");
}

export function unauthorized(message = "Unauthorized"): HttpError {
  return new HttpError(401, message, "unauthorized");
}

export function badRequest(message: string, code = "bad_request"): HttpError {
  return new HttpError(400, message, code);
}

export function conflict(message: string): HttpError {
  return new HttpError(409, message, "conflict");
}
