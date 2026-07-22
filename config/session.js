const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);

// Uses its own `admin_sessions` table (see sql/schema.sql) - completely
// separate from the Consultant Dashboard's `sessions` table. The two
// apps must never share session rows.
const store = new MySQLStore({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  createDatabaseTable: false, // table already created by sql/schema.sql
  schema: {
    tableName: 'admin_sessions',
    columnNames: {
      session_id: 'session_id',
      expires: 'expires',
      data: 'data'
    }
  },
  clearExpired: true,
  checkExpirationInterval: 15 * 60 * 1000, // 15 min
  expiration: 8 * 60 * 60 * 1000 // 8 hours
});

module.exports = session({
  key: 'handsight.admin.sid',
  secret: process.env.SESSION_SECRET,
  store,
  resave: false,
  saveUninitialized: false,
  rolling: true, // sliding idle timeout: activity extends the session
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000 // 8 hours idle timeout
  }
});
