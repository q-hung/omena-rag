/** Every expected failure carries the code the API returns (§17b error shape). */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly conversationId?: number;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    options?: ErrorOptions & { conversationId?: number },
  ) {
    super(message, options);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.conversationId = options?.conversationId;
  }
}

export const badRequest = (code: string, message: string) => new AppError(400, code, message);
export const unauthorized = (message = 'Sign in to continue.') =>
  new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (code: string, message: string) => new AppError(403, code, message);
export const notFound = (code: string, message: string) => new AppError(404, code, message);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const tooManyRequests = (code: string, message: string) => new AppError(429, code, message);
export const unavailable = (code: string, message: string) => new AppError(503, code, message);
export const budgetReached = () =>
  tooManyRequests('budget_reached', 'The daily model budget has been reached. Try again tomorrow.');
export const generationQuota = () =>
  tooManyRequests('GENERATION_QUOTA', 'This employee has reached the daily generation limit.');
export const notOwner = () =>
  forbidden('NOT_OWNER', 'Only the employee who started this conversation can change it.');
