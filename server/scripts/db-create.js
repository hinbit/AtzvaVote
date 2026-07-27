#!/usr/bin/env node
// scripts/db-create.js
// יוצר את ה-DATABASE עצמו ב-MySQL אם הוא לא קיים.
// מתחבר ללא database param (כי הוא עוד לא נוצר), משתמש בפרטי השרת מ-.env.
// בטוח להרצה חוזרת.

require('dotenv').config();
const mysql = require('mysql2/promise');

const dbName  = process.env.DB_NAME || 'atzvavote';
const dbUser  = process.env.DB_USER || 'root';
const dbHost  = process.env.DB_HOST || '127.0.0.1';
const dbPort  = Number(process.env.DB_PORT) || 3306;
const dbPass  = process.env.DB_PASSWORD || '';

async function main() {
  const target = process.env.DB_SOCKET
    ? `socket ${process.env.DB_SOCKET}`
    : `${dbHost}:${dbPort}`;
  console.log(`📦 יוצר את מסד הנתונים '${dbName}' על ${target}...`);
  let conn;
  try {
    const connConfig = {
      ...(process.env.DB_SOCKET
        ? { socketPath: process.env.DB_SOCKET }
        : { host: dbHost, port: dbPort }),
      user: dbUser,
      password: dbPass,
      multipleStatements: true
    };
    conn = await mysql.createConnection(connConfig);
  } catch (e) {
    console.error('✗ כשל בהתחברות ל-MySQL:', e.message);
    console.error('   ודא ש-MySQL רץ ושפרטי ה-.env נכונים.');
    process.exit(1);
  }
  try {
    // utf8mb4 - תמיכה מלאה בעברית ובאמוג'ים
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\`
       DEFAULT CHARACTER SET utf8mb4
       DEFAULT COLLATE utf8mb4_unicode_ci`
    );
    console.log(`   ✓ '${dbName}' מוכן (utf8mb4)`);
  } finally {
    await conn.end();
  }
}

main().then(() => process.exit(0)).catch(e => {
  console.error('✗ שגיאה:', e.message);
  process.exit(1);
});
