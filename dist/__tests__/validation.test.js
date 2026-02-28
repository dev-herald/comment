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
        testResults: '',
        stickyId: '',
        apiUrl: BASE_URL,
        signal: '',
        include: '',
        enableCve: '',
        maxDeps: '',
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
    (0, vitest_1.it)('throws when templateData is empty and no test-results is set', () => {
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
            testResults: '',
            stickyId: '',
            apiUrl: BASE_URL,
            signal: '',
            include: '',
            enableCve: '',
            maxDeps: '',
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
    (0, vitest_1.it)('throws when "include" is set without "signal"', () => {
        (0, vitest_1.expect)(() => (0, validation_1.validateInputs)(makeRawInputs({ include: 'dependencies' }))).toThrow(/"include".*signal|signal.*"include"/i);
    });
    (0, vitest_1.it)('throws when "enable-cve" is set without "signal"', () => {
        (0, vitest_1.expect)(() => (0, validation_1.validateInputs)(makeRawInputs({ enableCve: 'true' }))).toThrow(/"enable-cve".*signal|signal.*"enable-cve"/i);
    });
    (0, vitest_1.it)('throws when "max-deps" is set without "signal"', () => {
        (0, vitest_1.expect)(() => (0, validation_1.validateInputs)(makeRawInputs({ maxDeps: '10' }))).toThrow(/"max-deps".*signal|signal.*"max-deps"/i);
    });
    (0, vitest_1.it)('throws listing all signal-only inputs when multiple are set without signal', () => {
        const err = () => (0, validation_1.validateInputs)(makeRawInputs({ include: 'dependencies', maxDeps: '10' }));
        (0, vitest_1.expect)(err).toThrow(/"include"/);
        (0, vitest_1.expect)(err).toThrow(/"max-deps"/);
    });
    (0, vitest_1.it)('does not throw when signal-only inputs are set alongside signal', () => {
        (0, vitest_1.expect)(() => (0, validation_1.validateInputs)(makeRawInputs({ signal: 'DEPENDENCY_DIFF', include: 'dependencies', enableCve: 'true', maxDeps: '10' }))).not.toThrow();
    });
    (0, vitest_1.it)('throws when both "template" and "signal" are provided', () => {
        (0, vitest_1.expect)(() => (0, validation_1.validateInputs)(makeRawInputs({ template: 'DEPLOYMENT', signal: 'DEPENDENCY_DIFF' }))).toThrow(/Cannot provide both "template" and "signal"/);
    });
    (0, vitest_1.it)('does not throw when only "template" is provided (no signal)', () => {
        (0, vitest_1.expect)(() => (0, validation_1.validateInputs)(makeRawInputs({ template: 'DEPLOYMENT' }))).not.toThrow();
    });
    (0, vitest_1.it)('does not throw when only "signal" is provided (no template)', () => {
        (0, vitest_1.expect)(() => (0, validation_1.validateInputs)(makeRawInputs({ signal: 'TEST_RESULTS' }))).not.toThrow();
    });
});
// ---------------------------------------------------------------------------
// TEST_RESULTS template deprecation
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('buildRequestConfig – TEST_RESULTS template deprecation', () => {
    (0, vitest_1.it)('throws a deprecation error when template: TEST_RESULTS is used', () => {
        const inputs = makeDeploymentInputs({
            template: 'TEST_RESULTS',
            templateData: JSON.stringify({ testSuites: [] }),
        });
        (0, vitest_1.expect)(() => (0, validation_1.buildRequestConfig)(inputs)).toThrow(/TEST_RESULTS template is deprecated/);
    });
    (0, vitest_1.it)('deprecation error message includes migration hint to signal: TEST_RESULTS', () => {
        const inputs = makeDeploymentInputs({
            template: 'TEST_RESULTS',
            templateData: JSON.stringify({ testSuites: [] }),
        });
        (0, vitest_1.expect)(() => (0, validation_1.buildRequestConfig)(inputs)).toThrow(/signal.*TEST_RESULTS/);
    });
});
