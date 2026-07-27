#!/usr/bin/env node
// scripts/db-reset.js
// מוחק את ה-DATABASE כולו ומקים אותו מחדש (DROP + CREATE + INIT + SEED).
// ⚠️ הורס את כל הנתונים - לשימוש בפיתוח בלבד.

require('dotenv').config();
const mysql = require('mysql2/promise');
const { spawnSync } = require('child_process');
const path = require('path');

const dbName = process.env.DB_NAME || 'atzvavote';

async function drop() {
  const connConfig = {
    ...(process.env.DB_SOCKET
      ? { socketPath: process.env.DB_SOCKET }
      : {
          host: process.env.DB_HOST     || '127.0.0.1',
          port: Number(process.env.DB_PORT) || 3306
        }),
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || ''
  };
  const conn = await mysql.createConnection(connConfig);
  console.log(`🗑️  מוחק את DATABASE '${dbName}'...`);
  await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
  await conn.end();
  console.log('   ✓ נמחק');
}

function npmRun(script) {
  const r = spawnSync('npm', ['run', script], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    shell: process.platform === 'win32'
  });
  if (r.status !== 0) process.exit(r.status || 1);
}

(async () => {
  await drop();
  npmRun('db:create');
  npmRun('db:init');
  npmRun('db:seed');
  console.log('\n♻️  איפוס הושלם.\n');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
