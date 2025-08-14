/**
 * MCP MultiServer client module
 * Centralized access to all MCP functionality with LangChain integration
 */

import type { Tool } from '@langchain/core/tools';
import { ReliableMCPClient, loadMcpTools } from './client.js';
import { config, getMcpConfig } from '../config.js';
import { getChatOllama } from '../llm/index.js';
import { ChatOpenAI } from '@langchain/openai';

// Singleton instance
let mcpClient: ReliableMCPClient | null = null;
let mcpTools: Tool[] = [];
let llm: ChatOpenAI | null = null;
let isInitialized = false;

/**
 * Initialize MCP MultiServer client
 */
export async function initializeMCP(): Promise<void> {
  if (isInitialized) return;

  try {
    console.log('🚀 Initializing MCP MultiServer client...');

    const mcpConfig = getMcpConfig();
    console.log('🔧 MCP Configuration:');
    console.log('  Notion:', mcpConfig.notion.enabled ? '✅ Enabled' : '❌ Disabled');
    console.log('  Jira:', mcpConfig.jira.enabled ? '✅ Enabled' : '❌ Disabled');
    console.log('  Google:', mcpConfig.google.enabled ? '✅ Enabled' : '❌ Disabled');

    // Load MCP tools using the reliable client
    const { tools, client } = await loadMcpTools();
    mcpClient = client;
    mcpTools = tools;

    console.log(`📋 Loaded ${mcpTools.length} MCP tools:`, mcpTools.map(t => t.name));

    // Initialize LLM for tool calling (prefer OpenAI if available)
    const llmConfig = config.llm;
    if (llmConfig.providers.openai.enabled && llmConfig.providers.openai.apiKey) {
      try {
        llm = new ChatOpenAI({
          modelName: 'gpt-4o-mini',
          apiKey: llmConfig.providers.openai.apiKey,
          temperature: 0.1,
        });
        console.log('✅ Using OpenAI for MCP tool calling');
      } catch (error) {
        console.warn('⚠️  OpenAI initialization failed, will use Ollama');
      }
    }

    isInitialized = true;
    console.log(`✅ MCP MultiServer initialized with ${mcpTools.length} tools`);

  } catch (error) {
    console.error('❌ Failed to initialize MCP MultiServer:', error);
    isInitialized = false;
    // Don't throw - allow service to continue
  }
}

/**
 * Get MCP client instance
 */
export function getMCPClient(): ReliableMCPClient | null {
  return mcpClient;
}

/**
 * Get all available MCP tools
 */
export function getMCPTools(): Tool[] {
  return mcpTools;
}

/**
 * Get tools from specific server
 */
export function getMCPToolsByServer(serverName: string): Tool[] {
  if (!mcpClient) return [];
  return mcpClient.getToolsByServer(serverName);
}

/**
 * Execute MCP tool by name
 */
export async function executeMCPTool(toolName: string, parameters: any): Promise<any> {
  if (!mcpClient) {
    throw new Error('MCP client not initialized');
  }

  try {
    console.log(`🔧 Executing MCP tool: ${toolName}`);
    const result = await mcpClient.executeTool(toolName, parameters);
    console.log(`✅ MCP tool completed: ${toolName}`);
    return result;
  } catch (error) {
    console.error(`❌ MCP tool failed: ${toolName}:`, error);
    throw error;
  }
}

/**
 * Get MCP LLM instance (OpenAI preferred, Ollama fallback)
 */
export function getMCPLLM(): ChatOpenAI | null {
  return llm;
}

/**
 * Check if MCP is ready
 */
export function isMCPReady(): boolean {
  return isInitialized && mcpClient !== null && mcpClient.isReady();
}

/**
 * Get MCP server status
 */
export async function getMCPServerStatus(): Promise<Record<string, { connected: boolean; toolCount: number }>> {
  if (!mcpClient) {
    return {
      notion: { connected: false, toolCount: 0 },
      google: { connected: false, toolCount: 0 },
      atlassian: { connected: false, toolCount: 0 },
    };
  }
  
  return await mcpClient.getServerStatus();
}

/**
 * Get comprehensive MCP health status
 */
export async function getMCPHealthStatus(): Promise<{
  healthy: boolean;
  servers: Record<string, { connected: boolean; toolCount: number }>;
  totalTools: number;
  llmAvailable: boolean;
}> {
  if (!mcpClient) {
    return {
      healthy: false,
      servers: {},
      totalTools: 0,
      llmAvailable: false,
    };
  }

  const health = await mcpClient.healthCheck();
  return {
    ...health,
    llmAvailable: llm !== null,
  };
}

/**
 * Reconnect MCP servers
 */
export async function reconnectMCP(): Promise<void> {
  console.log('🔄 Reconnecting MCP servers...');
  
  if (mcpClient) {
    try {
      await mcpClient.reconnect();
      mcpTools = mcpClient.getTools();
      console.log(`✅ MCP reconnected with ${mcpTools.length} tools`);
    } catch (error) {
      console.error('❌ MCP reconnection failed:', error);
      throw error;
    }
  } else {
    await initializeMCP();
  }
}

/**
 * Close MCP connections
 */
export async function closeMCP(): Promise<void> {
  if (mcpClient) {
    try {
      await mcpClient.close();
      console.log('✅ MCP connections closed');
    } catch (error) {
      console.error('❌ Error closing MCP:', error);
    }
  }
  
  isInitialized = false;
  mcpClient = null;
  mcpTools = [];
  llm = null;
}

/**
 * Ensure MCP is ready
 */
export async function ensureMCPReady(): Promise<void> {
  if (!isInitialized) {
    await initializeMCP();
  }
}