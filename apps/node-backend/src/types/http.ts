export interface ApiErrorResponse {
  error: string;
  retryAfter?: number;
  stack?: string;
}
