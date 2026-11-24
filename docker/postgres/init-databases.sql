-- Initialize service-specific databases.
-- taskflow_backend is created by the image from POSTGRES_DB (docker-compose.yml); creating it here
-- again fails, and the entrypoint stops the script on the first error.
CREATE DATABASE taskflow_ai;

-- Initialize isolated test databases (never share with runtime)
CREATE DATABASE taskflow_test;
CREATE DATABASE taskflow_ai_test;

-- Initialize isolated evaluation databases (never share with runtime)
CREATE DATABASE taskflow_eval;
CREATE DATABASE taskflow_ai_eval;

