const express = require('express');
const cors = require('cors');
const session = require('express-session');
require('dotenv').config();

const authRouter = require('./auth');

const app = express();
app.use(cors());
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'cozy-player-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' }
}));

app.use('/auth', authRouter);
app.use('/', authRouter);

app.get('/', (req, res) => {
  res.json({ message: 'Cozy Player OAuth server. Use /auth/login to begin.' });
});

const PORT = process.env.PORT || 8888;
app.listen(PORT, () => {
  console.log(`OAuth server listening on http://localhost:${PORT}`);
});

module.exports = app;
