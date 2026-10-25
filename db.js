/**
 * PawAlert DB loader
 * - If SUPABASE_URL is set → use PostgreSQL via Supabase
 * - Otherwise → local JSON file (original behaviour)
 */
if (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY)) {
  console.log('Using Supabase (PostgreSQL) database');
  module.exports = require('./db-supabase');
} else {
  console.log('Using local JSON database');
  module.exports = require('./db-json');
}
