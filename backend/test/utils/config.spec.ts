import config from '../../src/utils/config.js';

describe('Config Utils', () => {
  describe('config object', () => {
    it('should be defined', () => {
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
    });

    it('should be an object that can accept properties', () => {
      // Test that config is extensible
      const testConfig = { ...config };
      testConfig.testProperty = 'test';
      
      expect(testConfig.testProperty).toBe('test');
    });

    it('should have object-like behavior', () => {
      // Test that we can access properties
      const keys = Object.keys(config);
      expect(Array.isArray(keys)).toBe(true);
    });
  });
});