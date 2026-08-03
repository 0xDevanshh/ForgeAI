export interface ValidationFieldError {
  field: string;
  message: string;
}

export interface ApiErrorResponse {
  error: string;
  code?: string;
  details?: ValidationFieldError[];
  retryAfter?: number;
  stack?: string;
}
