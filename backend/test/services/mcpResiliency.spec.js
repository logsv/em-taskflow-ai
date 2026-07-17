import { expect } from 'chai';
import { wrapToolForResiliency } from '../../src/mcp/index.js';

describe('MCP Tool Resiliency Wrap', () => {
  it('should intercept tool execution errors and return them as error strings', async () => {
    const failingTool = {
      name: 'failing_tool',
      invoke: async () => {
        throw new Error('Database connection timed out');
      },
      call: async () => {
        throw new Error('Database connection timed out');
      },
    };

    const wrapped = wrapToolForResiliency(failingTool);

    const invokeResult = await wrapped.invoke({});
    expect(invokeResult).to.equal('Error executing tool failing_tool: Database connection timed out');

    const callResult = await wrapped.call({});
    expect(callResult).to.equal('Error executing tool failing_tool: Database connection timed out');
  });

  it('should pass through successful execution results', async () => {
    const successTool = {
      name: 'success_tool',
      invoke: async (input) => {
        return `Success: ${JSON.stringify(input)}`;
      },
    };

    const wrapped = wrapToolForResiliency(successTool);

    const result = await wrapped.invoke({ key: 'val' });
    expect(result).to.equal('Success: {"key":"val"}');
  });
});
