#!/usr/bin/env node

/**
 * CLI Script: Clean Database Tables
 * Safely wipes legacy dummy data, action items, audit runs, and cache tables while strictly preserving app_settings.
 * 
 * Usage:
 *   node scripts/clean-database.js
 *   node scripts/clean-database.js --dry-run
 */

import 'dotenv/config';
import { cleanupDatabaseTables, DEFAULT_CLEANUP_TABLES } from '../src/db/dbCleanup.js';

async function main() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log('🧹 [EM TaskFlow AI] Database Cleanup Tool');
  console.log('==========================================');
  console.log(`Database URL: ${process.env.DATABASE_URL || 'postgresql://taskflow:taskflow@localhost:5432/taskflow_backend'}`);
  console.log('Target tables to truncate:');
  DEFAULT_CLEANUP_TABLES.forEach((t) => console.log(`  - ${t}`));
  console.log('🔒 Protected tables (NEVER truncated):');
  console.log('  - app_settings (Tool API keys, provider settings, feature flags)');
  console.log('==========================================');

  if (isDryRun) {
    console.log('🔍 DRY RUN mode active. No tables were modified.');
    process.exit(0);
  }

  try {
    const result = await cleanupDatabaseTables({ preserveSettings: true });
    console.log('\n✅ Cleanup completed successfully!');
    console.log(`Cleaned tables count: ${result.cleanedTables.length}`);
    if (result.errors.length > 0) {
      console.log('Warnings/Errors:');
      result.errors.forEach((e) => console.log(`  - ${JSON.stringify(e)}`));
    }
    process.exit(0);
  } catch (err) {
    console.error('❌ Database cleanup failed:', err);
    process.exit(1);
  }
}

main();
