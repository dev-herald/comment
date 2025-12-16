/**
 * TypeScript interfaces based on OpenAPI spec
 */

export interface SimpleCommentRequest {
  comment: string;
  prNumber: number;
}

export interface TemplateCommentRequest {
  prNumber: number;
  template: 'DEPLOYMENT' | 'TEST_RESULTS' | 'MIGRATION' | 'CUSTOM_TABLE';
  data: any;
  stickyId?: string;
}

export interface SimpleCommentResponse {
  success: boolean;
  message: string;
  projectId: string;
  apiKeyId: string;
  commentId: string;
  prNumber: number;
  repository: string;
  githubCommentId: string;
  githubCommentUrl: string;
  commentLength: number;
}

export interface TemplateCommentResponse {
  data: {
    message: string;
    commentId: string;
    status: string;
  };
}

export interface ErrorResponse {
  error?: string;
  errors?: Array<{
    message: string;
    code?: string;
    field?: string;
    details?: any;
  }>;
  details?: any;
  commentId?: string;
}

export type RequestBody = SimpleCommentRequest | TemplateCommentRequest;

export interface ActionInputs {
  apiKey: string;
  prNumber: number;
  comment: string;
  template: string;
  templateData: string;
  stickyId: string;
  apiUrl: string;
}

export interface RequestConfig {
  endpoint: string;
  requestBody: RequestBody;
  mode: 'simple' | 'template';
}

