-- Initialize service-specific databases
CREATE DATABASE taskflow_backend;
CREATE DATABASE taskflow_ai;

-- Initialize isolated test databases (never share with runtime)
CREATE DATABASE taskflow_test;
CREATE DATABASE taskflow_ai_test;

