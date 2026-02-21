"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
// Mock @actions/core so core.info / core.setFailed etc. are no-ops
vitest_1.vi.mock('@actions/core');
const validation_1 = require("../validation");
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const BASE_URL = 'https://dev-herald.com/api/v1/github';
/**
 * Returns a fully-valid ActionInputs object for the DEPLOYMENT template.
 * Individual fields can be overridden per-test with spread.
 */
function makeDeploymentInputs(overrides = {}) {
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
        stickyId: '',
        apiUrl: BASE_URL,
        ...overrides,
    };
}
// ---------------------------------------------------------------------------
// Mode selection errors
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('buildRequestConfig – mode selection', () => {
    (0, vitest_1.it)('throws when neither comment nor template is provided', () => {
        const inputs = makeDeploymentInputs({ template: '', templateData: '' });
        (0, vitest_1.expect)(() => (0, validation_1.buildRequestConfig)(inputs)).toThrow('Must provide either');
    });
    (0, vitest_1.it)('throws when both comment and template are provided', () => {
        const inputs = makeDeploymentInputs({ comment: 'Hello!' });
        (0, vitest_1.expect)(() => (0, validation_1.buildRequestConfig)(inputs)).toThrow('Cannot provide both');
    });
});
// ---------------------------------------------------------------------------
// Deployment template – happy paths
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('buildRequestConfig – deployment template happy paths', () => {
    vitest_1.it.each(['building', 'queued', 'success', 'failed'])('returns a valid RequestConfig for status "%s"', (status) => {
        const inputs = makeDeploymentInputs({
            templateData: JSON.stringify({
                projectName: 'My App',
                deploymentStatus: status,
                deploymentLink: 'https://vercel.com/deployments/abc123',
            }),
        });
        const config = (0, validation_1.buildRequestConfig)(inputs);
        (0, vitest_1.expect)(config.mode).toBe('template');
        (0, vitest_1.expect)(config.endpoint).toMatch(/\/comment\/template$/);
        (0, vitest_1.expect)(config.requestBody.template).toBe('DEPLOYMENT');
        (0, vitest_1.expect)(config.requestBody.data.deploymentStatus).toBe(status);
    });
    (0, vitest_1.it)('auto-populates statusIconUrl from DEPLOYMENT_STATUS_IMGS when not provided', () => {
        const config = (0, validation_1.buildRequestConfig)(makeDeploymentInputs());
        (0, vitest_1.expect)(config.requestBody.data.statusIconUrl).toBe('https://dev-herald.com/imgs/success.svg');
    });
    (0, vitest_1.it)('preserves an explicit statusIconUrl instead of overwriting it', () => {
        const customIcon = 'https://example.com/my-icon.svg';
        const inputs = makeDeploymentInputs({
            templateData: JSON.stringify({
                projectName: 'My App',
                deploymentStatus: 'success',
                deploymentLink: 'https://vercel.com/deployments/abc123',
                statusIconUrl: customIcon,
            }),
        });
        const config = (0, validation_1.buildRequestConfig)(inputs);
        (0, vitest_1.expect)(config.requestBody.data.statusIconUrl).toBe(customIcon);
    });
    (0, vitest_1.it)('includes stickyId in requestBody when provided', () => {
        const inputs = makeDeploymentInputs({ stickyId: 'deploy-status' });
        const config = (0, validation_1.buildRequestConfig)(inputs);
        (0, vitest_1.expect)(config.requestBody.stickyId).toBe('deploy-status');
    });
    (0, vitest_1.it)('succeeds with only required fields (no optional fields)', () => {
        const inputs = makeDeploymentInputs({
            templateData: JSON.stringify({
                projectName: 'Minimal App',
                deploymentStatus: 'failed',
                deploymentLink: 'https://vercel.com/deployments/xyz',
            }),
        });
        (0, vitest_1.expect)(() => (0, validation_1.buildRequestConfig)(inputs)).not.toThrow();
    });
});
// ---------------------------------------------------------------------------
// Deployment template – error paths
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('buildRequestConfig – deployment template errors', () => {
    (0, vitest_1.it)('throws when templateData is empty', () => {
        const inputs = makeDeploymentInputs({ templateData: '' });
        (0, vitest_1.expect)(() => (0, validation_1.buildRequestConfig)(inputs)).toThrow('template-data is required');
    });
    (0, vitest_1.it)('throws when templateData is not valid JSON', () => {
        const inputs = makeDeploymentInputs({ templateData: '{ not valid json' });
        (0, vitest_1.expect)(() => (0, validation_1.buildRequestConfig)(inputs)).toThrow('Invalid JSON');
    });
    (0, vitest_1.it)('throws with allowed values hint when deploymentStatus is invalid', () => {
        const inputs = makeDeploymentInputs({
            templateData: JSON.stringify({
                projectName: 'My App',
                deploymentStatus: 'deployed', // not a valid status
                deploymentLink: 'https://vercel.com/deployments/abc123',
            }),
        });
        const err = () => (0, validation_1.buildRequestConfig)(inputs);
        (0, vitest_1.expect)(err).toThrow(/building.*queued.*success.*failed|Allowed values/i);
    });
    (0, vitest_1.it)('throws a Zod error referencing projectName when it is missing', () => {
        const inputs = makeDeploymentInputs({
            templateData: JSON.stringify({
                deploymentStatus: 'success',
                deploymentLink: 'https://vercel.com/deployments/abc123',
            }),
        });
        (0, vitest_1.expect)(() => (0, validation_1.buildRequestConfig)(inputs)).toThrow(/projectName/);
    });
    (0, vitest_1.it)('succeeds when deploymentLink is omitted (it is optional in the schema)', () => {
        const inputs = makeDeploymentInputs({
            templateData: JSON.stringify({
                projectName: 'My App',
                deploymentStatus: 'success',
            }),
        });
        (0, vitest_1.expect)(() => (0, validation_1.buildRequestConfig)(inputs)).not.toThrow();
    });
    (0, vitest_1.it)('throws a Zod error when deploymentLink is not a valid URL', () => {
        const inputs = makeDeploymentInputs({
            templateData: JSON.stringify({
                projectName: 'My App',
                deploymentStatus: 'success',
                deploymentLink: 'not-a-url',
            }),
        });
        (0, vitest_1.expect)(() => (0, validation_1.buildRequestConfig)(inputs)).toThrow();
    });
    (0, vitest_1.it)('throws when template type is unknown', () => {
        const inputs = makeDeploymentInputs({ template: 'UNKNOWN' });
        (0, vitest_1.expect)(() => (0, validation_1.buildRequestConfig)(inputs)).toThrow();
    });
});
// ---------------------------------------------------------------------------
// Deployment template – empty string sanitisation
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('buildRequestConfig – empty string sanitisation', () => {
    (0, vitest_1.it)('does not throw when previewLink is an empty string', () => {
        const inputs = makeDeploymentInputs({
            templateData: JSON.stringify({
                projectName: 'My App',
                deploymentStatus: 'failed',
                deploymentLink: 'https://vercel.com/deployments/abc123',
                previewLink: '',
            }),
        });
        (0, vitest_1.expect)(() => (0, validation_1.buildRequestConfig)(inputs)).not.toThrow();
    });
    (0, vitest_1.it)('omits previewLink from the request body when passed as empty string', () => {
        const inputs = makeDeploymentInputs({
            templateData: JSON.stringify({
                projectName: 'My App',
                deploymentStatus: 'failed',
                deploymentLink: 'https://vercel.com/deployments/abc123',
                previewLink: '',
            }),
        });
        const config = (0, validation_1.buildRequestConfig)(inputs);
        (0, vitest_1.expect)(config.requestBody.data.previewLink).toBeUndefined();
    });
    (0, vitest_1.it)('does not throw when deploymentLink is an empty string', () => {
        const inputs = makeDeploymentInputs({
            templateData: JSON.stringify({
                projectName: 'My App',
                deploymentStatus: 'success',
                deploymentLink: '',
            }),
        });
        (0, vitest_1.expect)(() => (0, validation_1.buildRequestConfig)(inputs)).not.toThrow();
    });
    (0, vitest_1.it)('does not throw when statusIconUrl is an empty string (falls back to default)', () => {
        const inputs = makeDeploymentInputs({
            templateData: JSON.stringify({
                projectName: 'My App',
                deploymentStatus: 'building',
                statusIconUrl: '',
            }),
        });
        const config = (0, validation_1.buildRequestConfig)(inputs);
        (0, vitest_1.expect)(config.requestBody.data.statusIconUrl).toBe('https://dev-herald.com/imgs/building.svg');
    });
    (0, vitest_1.it)('does not throw when all optional URL fields are empty strings simultaneously', () => {
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
        (0, vitest_1.expect)(() => (0, validation_1.buildRequestConfig)(inputs)).not.toThrow();
    });
    (0, vitest_1.it)('strips whitespace-only strings just like empty strings', () => {
        const inputs = makeDeploymentInputs({
            templateData: JSON.stringify({
                projectName: 'My App',
                deploymentStatus: 'success',
                previewLink: '   ',
            }),
        });
        const config = (0, validation_1.buildRequestConfig)(inputs);
        (0, vitest_1.expect)(config.requestBody.data.previewLink).toBeUndefined();
    });
    (0, vitest_1.it)('preserves a valid URL even when other fields are empty strings', () => {
        const inputs = makeDeploymentInputs({
            templateData: JSON.stringify({
                projectName: 'My App',
                deploymentStatus: 'success',
                deploymentLink: 'https://vercel.com/deployments/abc123',
                previewLink: '',
            }),
        });
        const config = (0, validation_1.buildRequestConfig)(inputs);
        (0, vitest_1.expect)(config.requestBody.data.deploymentLink).toBe('https://vercel.com/deployments/abc123');
    });
});
// ---------------------------------------------------------------------------
// validateInputs – basic input errors
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('validateInputs', () => {
    function makeRawInputs(overrides = {}) {
        return {
            apiKey: 'valid-key',
            prNumber: 1,
            comment: '',
            template: '',
            templateData: '',
            stickyId: '',
            apiUrl: BASE_URL,
            ...overrides,
        };
    }
    (0, vitest_1.it)('throws when apiKey is empty', () => {
        (0, vitest_1.expect)(() => (0, validation_1.validateInputs)(makeRawInputs({ apiKey: '' }))).toThrow('API key is required');
    });
    (0, vitest_1.it)('throws when apiUrl does not use HTTPS', () => {
        (0, vitest_1.expect)(() => (0, validation_1.validateInputs)(makeRawInputs({ apiUrl: 'http://dev-herald.com/api/v1/github' }))).toThrow(/https/i);
    });
    (0, vitest_1.it)('does not throw for valid inputs', () => {
        (0, vitest_1.expect)(() => (0, validation_1.validateInputs)(makeRawInputs())).not.toThrow();
    });
});
