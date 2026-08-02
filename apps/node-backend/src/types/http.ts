export interface ValidationFieldError {
  field: string;
  message: string;
}

export interface ApiErrorResponse {
  error: string;
  details?: ValidationFieldError[];
  retryAfter?: number;
  stack?: string;
}
