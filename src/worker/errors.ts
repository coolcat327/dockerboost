export class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function upstreamError(status: number, message: string) {
  return new HttpError(message, status === 404 ? 404 : status === 504 ? 504 : 502);
}
