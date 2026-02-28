/**
 * TypeScript interfaces based on OpenAPI spec
 */

export interface SimpleCommentRequest {
  comment: string;
  prNumber: number;
  stickyId?: string;
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
  testResults: string;
  stickyId: string;
  apiUrl: string;
  signal: string;
  include: string;
  enableCve: string;
  maxDeps: string;
}

export interface RequestConfig {
  endpoint: string;
  requestBody: RequestBody;
  mode: 'simple' | 'template';
}

