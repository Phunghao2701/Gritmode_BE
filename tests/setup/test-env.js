// Keep integration tests deterministic and prevent application imports from
// opening the developer's production services. Production auth still performs
// the active-session lookup because this only runs through the test scripts.
process.env.NODE_ENV = "test";
process.env.GRITMODE_TEST_MODE = "true";
