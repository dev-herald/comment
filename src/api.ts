import * as https from 'https';
import type { RequestBody } from './types';

export interface HttpResponse {
  statusCode: number;
  data: string;
}

/**
 * Makes an HTTPS request with the given parameters
 * @throws {Error} If the URL is not HTTPS (for security)
 */
export async function makeHttpRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: RequestBody
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    
    // Enforce HTTPS for security - API keys must be transmitted securely
    if (parsedUrl.protocol !== 'https:') {
      reject(new Error(`Only HTTPS URLs are allowed for security reasons. Got: ${parsedUrl.protocol}`));
      return;
    }

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: method,
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(JSON.stringify(body))
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          data: data
        });
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Network error: ${error.message}`));
    });

    req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Builds headers for the API request
 */
export function buildHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'User-Agent': 'Dev-Herald-GitHub-Action/1.0'
  };
}

