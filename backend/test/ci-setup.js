// CI-specific test setup
// This file configures the test environment for CI/CD pipelines

// Mock external services that aren't available in CI
const mockServices = {
  // Mock Ollama service
  mockOllama: () => {
    // Set environment variables to indicate CI mode
    process.env.CI_MODE = 'true';
    process.env.OLLAMA_AVAILABLE = 'false';
    process.env.CHROMA_AVAILABLE = 'false';
    process.env.GOOGLE_OAUTH_AVAILABLE = 'false';
  },

  // Mock Google OAuth
  mockGoogleOAuth: () => {
    process.env.GOOGLE_OAUTH_CREDENTIALS = JSON.stringify({
      client_id: 'mock-client-id',
      client_secret: 'mock-client-secret',
      redirect_uris: ['http://localhost:3000/auth/callback']
    });
  },

  // Mock MCP services
  mockMCPServices: () => {
    process.env.MCP_CALENDAR_AVAILABLE = 'false';
    process.env.MCP_NOTION_AVAILABLE = 'false';
    process.env.MCP_JIRA_AVAILABLE = 'false';
  }
};

// Initialize CI environment
if (process.env.CI || process.env.NODE_ENV === 'test') {
  console.log('🔧 Setting up CI test environment...');
  
  // Mock all external services
  mockServices.mockOllama();
  mockServices.mockGoogleOAuth();
  mockServices.mockMCPServices();
  
  // Set test timeouts for CI
  jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000; // 10 seconds
  
  console.log('✅ CI test environment configured');
}

module.exports = mockServices;