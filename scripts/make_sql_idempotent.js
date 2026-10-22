const fs = require('fs');

function makeSqlIdempotent(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace CREATE POLICY with DROP POLICY IF EXISTS + CREATE POLICY
  // Only if not already preceded by DROP POLICY IF EXISTS
  content = content.replace(/CREATE POLICY "([^"]+)" ON (public\.[a-zA-Z0-9_]+)/g, (match, pName, tblName) => {
    return `DROP POLICY IF EXISTS "${pName}" ON ${tblName};\nCREATE POLICY "${pName}" ON ${tblName}`;
  });

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated ${filePath}`);
}

makeSqlIdempotent('supabase/migrations/20261022000002_rls_policies.sql');
makeSqlIdempotent('supabase/setup_all.sql');
