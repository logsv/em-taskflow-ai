/**
 * Dedicated Pre-Initialization Tracing Module for Arize Phoenix & OpenInference.
 * Must be imported at line 0 before any application routes, Express, or LangChain modules load.
 */
import dotenv from 'dotenv';
dotenv.config();

import { register } from '@arizeai/phoenix-otel';
import { LangChainInstrumentation } from '@arizeai/openinference-instrumentation-langchain';
import { SamplingDecision } from '@opentelemetry/sdk-trace-base';
import * as CallbackManagerModule from '@langchain/core/callbacks/manager';

class AIOnlySampler {
  shouldSample(context, traceId, spanName, spanKind, attributes, links) {
    const name = String(spanName || '');
    const url = String(attributes?.['http.target'] || attributes?.['http.url'] || attributes?.['url.path'] || attributes?.['http.route'] || '');
    const isHttpSpan = name.startsWith('GET') || name.startsWith('POST') || name.startsWith('HTTP') || Boolean(attributes?.['http.method']);

    // Suppress all non-AI HTTP routes (health checks, polling, session checks, admin probes, static endpoints)
    if (isHttpSpan) {
      const isAiRoute = name.includes('/api/chat') || url.includes('/api/chat') || name.includes('/rag/query') || url.includes('/rag/query');
      if (!isAiRoute) {
        return { decision: SamplingDecision.NOT_RECORD };
      }
    }
    // Always sample OpenInference spans (AGENT, LLM, TOOL, RETRIEVER, CHAIN)
    return { decision: SamplingDecision.RECORD_AND_SAMPLED };
  }

  toString() {
    return 'AIOnlySampler';
  }
}

let phoenixInitialized = false;

if (process.env.PHOENIX_ENABLED !== 'false') {
  try {
    const endpoint = process.env.PHOENIX_COLLECTOR_ENDPOINT || 'http://127.0.0.1:6006/v1/traces';
    const projectName = process.env.PHOENIX_PROJECT_NAME || process.env.LANGCHAIN_PROJECT || 'emtaskflow';

    // Register Phoenix OpenTelemetry provider with zero default auto-instrumentations to avoid HTTP noise
    register({
      projectName,
      endpoint,
      instrumentations: [],
      sampler: new AIOnlySampler(),
    });

    // Manually instrument LangChain CallbackManager immediately prior to any chain/agent initialization
    const lcInstrumentation = new LangChainInstrumentation();
    lcInstrumentation.manuallyInstrument(CallbackManagerModule);

    phoenixInitialized = true;
  } catch (err) {
    console.warn('⚠️ Arize Phoenix OpenInference initialization warning:', err?.message || String(err));
  }
}

export { phoenixInitialized };
