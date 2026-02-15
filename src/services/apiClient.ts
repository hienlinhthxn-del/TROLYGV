// ===== ENHANCED API CLIENT WITH RATE LIMIT PROTECTION =====

import axios, { AxiosError } from 'axios';

interface RequestOptions {
    method?: string;
    headers?: Record<string, string>;
    data?: any;
    timeout?: number;
}

interface RetryConfig {
    maxRetries: number;
    initialDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 5,
    initialDelay: 1000,     // 1 second
    maxDelay: 30000,        // 30 seconds max
    backoffMultiplier: 2,   // exponential backoff
};

let requestQueue: Array<() => Promise<any>> = [];
let isProcessingQueue = false;
const MIN_REQUEST_INTERVAL = 1000; // Minimum 1 second between requests

let lastRequestTime = 0;

async function processQueue(): Promise<void> {
    if (isProcessingQueue || requestQueue.length === 0) return;

    isProcessingQueue = true;

    while (requestQueue.length > 0) {
        const now = Date.now();
        const timeSinceLastRequest = now - lastRequestTime;

        if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
            await new Promise(resolve =>
                setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
            );
        }

        const request = requestQueue.shift();
        if (request) {
            try {
                await request();
                lastRequestTime = Date.now();
            } catch (error) {
                console.error('❌ Queue processing error:', error);
            }
        }
    }

    isProcessingQueue = false;
}

/**
 * Execute API request with automatic retry on 429 errors
 * Implements exponential backoff and request queuing
 */
export async function callGeminiAPI(
    url: string,
    options: RequestOptions,
    config: Partial<RetryConfig> = {}
): Promise<any> {
    const mergedConfig = { ...DEFAULT_RETRY_CONFIG, ...config };

    return new Promise((resolve, reject) => {
        const executeRequest = async () => {
            try {
                const response = await performRequestWithRetry(url, options, mergedConfig, 0);
                resolve(response);
            } catch (error) {
                reject(error);
            }
        };

        requestQueue.push(executeRequest);
        processQueue().catch(reject);
    });
}

async function performRequestWithRetry(
    url: string,
    options: RequestOptions,
    config: RetryConfig,
    attemptNumber: number
): Promise<any> {
    try {
        console.log(`📤 Request attempt ${attemptNumber + 1}/${config.maxRetries + 1}`);

        const response = await axios({
            url,
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            data: options.data,
            timeout: options.timeout || 30000,
        });

        console.log('✅ Request successful');
        return response.data;

    } catch (error: any) {
        const status = error.response?.status;
        const retryAfter = error.response?.headers['retry-after'];

        if (status === 429) {
            if (attemptNumber < config.maxRetries) {
                // Calculate exponential backoff delay
                const delay = Math.min(
                    config.initialDelay * Math.pow(config.backoffMultiplier, attemptNumber),
                    config.maxDelay
                );

                console.warn(
                    `⚠️ Rate limit hit (attempt ${attemptNumber + 1}/${config.maxRetries + 1}). ` +
                    `Waiting ${delay}ms before retry...`
                );

                // Emit event for UI updates (if using event emitter)
                window.dispatchEvent(new CustomEvent('apiRateLimit', {
                    detail: { attemptNumber: attemptNumber + 1, maxRetries: config.maxRetries }
                }));

                await new Promise(resolve => setTimeout(resolve, delay));
                return performRequestWithRetry(url, options, config, attemptNumber + 1);
            } else {
                const errorMsg = `Max retries (${config.maxRetries}) exceeded for rate limit.`;
                console.error(`❌ ${errorMsg}`);
                throw new Error(errorMsg);
            }
        } else {
            // Handle other errors
            console.error(`❌ Request failed with status ${status}:`, error.message);
            throw error;
        }
    }
}

export default callGeminiAPI;