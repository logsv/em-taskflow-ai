/**
 * Single source of truth for local model names.
 *
 * The chat model was chosen for tool-calling accuracy and faithfulness on the
 * target hardware (Mac mini M4, 16 GB): see docs/PRODUCT_ENGINEERING_REVIEW.md §C.5.
 * Override at runtime with LLM_DEFAULT_MODEL / RAG_EMBEDDING_MODEL, or via
 * Admin → Settings (stored in app_settings).
 *
 * This module must not import config.js, so config.js can import it.
 */

export const DEFAULT_CHAT_MODEL = 'qwen3:8b-q8_0';
export const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text';

/** Chat models offered in the Admin settings dropdown. */
export const DEFAULT_AVAILABLE_CHAT_MODELS = [DEFAULT_CHAT_MODEL];

/**
 * Previously shipped default chat model(s). A stored setting that still holds one
 * of these was never chosen by the owner, so it is migrated to DEFAULT_CHAT_MODEL
 * when settings are loaded. An explicit later choice in Admin → Settings is kept.
 */
export const LEGACY_DEFAULT_CHAT_MODELS = ['hermes3:8b'];

/**
 * Models that used to be pre-listed in the settings dropdown but are not installed
 * by scripts/setup-ollama-models.sh. They are dropped from the stored dropdown list
 * on load (the owner can still type any installed model name).
 */
export const RETIRED_CHAT_MODELS = [
  'hermes3:8b',
  'qwen2.5:14b',
  'mistral-small:24b',
  'qwen2.5:32b',
  'command-r:35b',
  'llama3.3:70b',
  'gpt-oss:20b',
  'gpt-oss:latest',
  'mistral:latest',
  'llama3.1:8b',
  'llama2',
];

export function isLegacyDefaultChatModel(model) {
  return typeof model === 'string' && LEGACY_DEFAULT_CHAT_MODELS.includes(model.trim());
}

export function isRetiredChatModel(model) {
  return typeof model === 'string' && RETIRED_CHAT_MODELS.includes(model.trim());
}
