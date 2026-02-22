import { describe, it, expect, vi } from 'vitest';

// Mock @actions/core so core.info / core.setFailed etc. are no-ops
vi.mock('@actions/core');

import { buildRequestConfig, validateInputs } from '../validation';
import type { ActionInputs, TemplateCommentRequest } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_URL = 'https://dev-herald.com/api/v1/github';

/**
 * Returns a fully-valid ActionInputs object for the DEPLOYMENT template.
 * Individual fields can be overridden per-test with spread.
 */
function makeDeploymentInputs(overrides: Partial<ActionInputs> = {}): ActionInputs {
  return {
    apiKey: 'test-api-key',
    prNumber: 42,
    comment: '',
    template: 'DEPLOYMENT',
    templateData: JSON.stringify({
      projectName: 'My App',
      deploymentStatus: 'success',
      deploymentLink: 'https://vercel.com/deployments/abc123',
    }),
    resultLocation: '',
    stickyId: '',
    apiUrl: BASE_URL,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mode selection errors
// ---------------------------------------------------------------------------

describe('buildRequestConfig – mode selection', () => {
  it('throws when neither comment nor template is provided', () => {
    const inputs = makeDeploymentInputs({ template: '', templateData: '' });
    expect(() => buildRequestConfig(inputs)).toThrow('Must provide either');
  });

  it('throws when both comment and template are provided', () => {
    const inputs = makeDeploymentInputs({ comment: 'Hello!' });
    expect(() => buildRequestConfig(inputs)).toThrow('Cannot provide both');
  });
});

// ---------------------------------------------------------------------------
// Deployment template – happy paths
// ---------------------------------------------------------------------------

describe('buildRequestConfig – deployment template happy paths', () => {
  it.each(['building', 'queued', 'success', 'failed'] as const)(
    'returns a valid RequestConfig for status "%s"',
    (status) => {
      const inputs = makeDeploymentInputs({
        templateData: JSON.stringify({
          projectName: 'My App',
          deploymentStatus: status,
          deploymentLink: 'https://vercel.com/deployments/abc123',
        }),
      });

      const config = buildRequestConfig(inputs);

      expect(config.mode).toBe('template');
      expect(config.endpoint).toMatch(/\/comment\/template$/);
      expect((config.requestBody as TemplateCommentRequest).template).toBe('DEPLOYMENT');
      expect((config.requestBody as TemplateCommentRequest).data.deploymentStatus).toBe(status);
    }
  );

  it('auto-populates statusIconUrl from DEPLOYMENT_STATUS_IMGS when not provided', () => {
    const config = buildRequestConfig(makeDeploymentInputs());
    expect((config.requestBody as TemplateCommentRequest).data.statusIconUrl).toBe(
      'https://dev-herald.com/imgs/success.svg'
    );
  });

  it('preserves an explicit statusIconUrl instead of overwriting it', () => {
    const customIcon = 'https://example.com/my-icon.svg';
    const inputs = makeDeploymentInputs({
      templateData: JSON.stringify({
        projectName: 'My App',
        deploymentStatus: 'success',
        deploymentLink: 'https://vercel.com/deployments/abc123',
        statusIconUrl: customIcon,
      }),
    });

    const config = buildRequestConfig(inputs);
    expect((config.requestBody as TemplateCommentRequest).data.statusIconUrl).toBe(customIcon);
  });

  it('includes stickyId in requestBody when provided', () => {
    const inputs = makeDeploymentInputs({ stickyId: 'deploy-status' });
    const config = buildRequestConfig(inputs);
    expect((config.requestBody as TemplateCommentRequest).stickyId).toBe('deploy-status');
  });

  it('succeeds with only required fields (no optional fields)', () => {
    const inputs = makeDeploymentInputs({
      templateData: JSON.stringify({
        projectName: 'Minimal App',
        deploymentStatus: 'failed',
        deploymentLink: 'https://vercel.com/deployments/xyz',
      }),
    });

    expect(() => buildRequestConfig(inputs)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Deployment template – error paths
// ---------------------------------------------------------------------------

describe('buildRequestConfig – deployment template errors', () => {
  it('throws when templateData is empty and no result-location is set', () => {
    const inputs = makeDeploymentInputs({ templateData: '' });
    expect(() => buildRequestConfig(inputs)).toThrow('template-data (or result-location) is required');
  });

  it('throws when templateData is not valid JSON', () => {
    const inputs = makeDeploymentInputs({ templateData: '{ not valid json' });
    expect(() => buildRequestConfig(inputs)).toThrow('Invalid JSON');
  });

  it('throws with allowed values hint when deploymentStatus is invalid', () => {
    const inputs = makeDeploymentInputs({
      templateData: JSON.stringify({
        projectName: 'My App',
        deploymentStatus: 'deployed', // not a valid status
        deploymentLink: 'https://vercel.com/deployments/abc123',
      }),
    });
    const err = () => buildRequestConfig(inputs);
    expect(err).toThrow(/building.*queued.*success.*failed|Allowed values/i);
  });

  it('throws a Zod error referencing projectName when it is missing', () => {
    const inputs = makeDeploymentInputs({
      templateData: JSON.stringify({
        deploymentStatus: 'success',
        deploymentLink: 'https://vercel.com/deployments/abc123',
      }),
    });
    expect(() => buildRequestConfig(inputs)).toThrow(/projectName/);
  });

  it('succeeds when deploymentLink is omitted (it is optional in the schema)', () => {
    const inputs = makeDeploymentInputs({
      templateData: JSON.stringify({
        projectName: 'My App',
        deploymentStatus: 'success',
      }),
    });
    expect(() => buildRequestConfig(inputs)).not.toThrow();
  });

  it('throws a Zod error when deploymentLink is not a valid URL', () => {
    const inputs = makeDeploymentInputs({
      templateData: JSON.stringify({
        projectName: 'My App',
        deploymentStatus: 'success',
        deploymentLink: 'not-a-url',
      }),
    });
    expect(() => buildRequestConfig(inputs)).toThrow();
  });

  it('throws when template type is unknown', () => {
    const inputs = makeDeploymentInputs({ template: 'UNKNOWN' });
    expect(() => buildRequestConfig(inputs)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Deployment template – empty string sanitisation
// ---------------------------------------------------------------------------

describe('buildRequestConfig – empty string sanitisation', () => {
  it('does not throw when previewLink is an empty string', () => {
    const inputs = makeDeploymentInputs({
      templateData: JSON.stringify({
        projectName: 'My App',
        deploymentStatus: 'failed',
        deploymentLink: 'https://vercel.com/deployments/abc123',
        previewLink: '',
      }),
    });
    expect(() => buildRequestConfig(inputs)).not.toThrow();
  });

  it('omits previewLink from the request body when passed as empty string', () => {
    const inputs = makeDeploymentInputs({
      templateData: JSON.stringify({
        projectName: 'My App',
        deploymentStatus: 'failed',
        deploymentLink: 'https://vercel.com/deployments/abc123',
        previewLink: '',
      }),
    });
    const config = buildRequestConfig(inputs);
    expect((config.requestBody as TemplateCommentRequest).data.previewLink).toBeUndefined();
  });

  it('does not throw when deploymentLink is an empty string', () => {
    const inputs = makeDeploymentInputs({
      templateData: JSON.stringify({
        projectName: 'My App',
        deploymentStatus: 'success',
        deploymentLink: '',
      }),
    });
    expect(() => buildRequestConfig(inputs)).not.toThrow();
  });

  it('does not throw when statusIconUrl is an empty string (falls back to default)', () => {
    const inputs = makeDeploymentInputs({
      templateData: JSON.stringify({
        projectName: 'My App',
        deploymentStatus: 'building',
        statusIconUrl: '',
      }),
    });
    const config = buildRequestConfig(inputs);
    expect((config.requestBody as TemplateCommentRequest).data.statusIconUrl).toBe(
      'https://dev-herald.com/imgs/building.svg'
    );
  });

  it('does not throw when all optional URL fields are empty strings simultaneously', () => {
    const inputs = makeDeploymentInputs({
      templateData: JSON.stringify({
        projectName: 'My App',
        deploymentStatus: 'queued',
        projectLink: '',
        deploymentLink: '',
        previewLink: '',
        commentsLink: '',
        statusIconUrl: '',
      }),
    });
    expect(() => buildRequestConfig(inputs)).not.toThrow();
  });

  it('strips whitespace-only strings just like empty strings', () => {
    const inputs = makeDeploymentInputs({
      templateData: JSON.stringify({
        projectName: 'My App',
        deploymentStatus: 'success',
        previewLink: '   ',
      }),
    });
    const config = buildRequestConfig(inputs);
    expect((config.requestBody as TemplateCommentRequest).data.previewLink).toBeUndefined();
  });

  it('preserves a valid URL even when other fields are empty strings', () => {
    const inputs = makeDeploymentInputs({
      templateData: JSON.stringify({
        projectName: 'My App',
        deploymentStatus: 'success',
        deploymentLink: 'https://vercel.com/deployments/abc123',
        previewLink: '',
      }),
    });
    const config = buildRequestConfig(inputs);
    expect((config.requestBody as TemplateCommentRequest).data.deploymentLink).toBe(
      'https://vercel.com/deployments/abc123'
    );
  });
});

// ---------------------------------------------------------------------------
// validateInputs – basic input errors
// ---------------------------------------------------------------------------

describe('validateInputs', () => {
  function makeRawInputs(overrides: Partial<ActionInputs> = {}): ActionInputs {
    return {
      apiKey: 'valid-key',
      prNumber: 1,
      comment: '',
      template: '',
      templateData: '',
      resultLocation: '',
      stickyId: '',
      apiUrl: BASE_URL,
      ...overrides,
    };
  }

  it('throws when apiKey is empty', () => {
    expect(() => validateInputs(makeRawInputs({ apiKey: '' }))).toThrow(
      'API key is required'
    );
  });

  it('throws when apiUrl does not use HTTPS', () => {
    expect(() =>
      validateInputs(makeRawInputs({ apiUrl: 'http://dev-herald.com/api/v1/github' }))
    ).toThrow(/https/i);
  });

  it('does not throw for valid inputs', () => {
    expect(() => validateInputs(makeRawInputs())).not.toThrow();
  });
});
