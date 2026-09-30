/**
 * app.js — MediQ Express Application Entry Point
 */

const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');
const helmet  = require('helmet');
// Load env vars FIRST — before any other local require that may read process.env
const dotenv  = require('dotenv');
dotenv.config();

// ─── Production environment validation ────────────────────────────────────────
// Fail fast on startup if critical variables are missing in production.
if (process.env.NODE_ENV === 'production') {
  const REQUIRED_PROD_VARS = ['MONGO_URI', 'JWT_SECRET', 'ALLOWED_ORIGINS'];
  const missing = REQUIRED_PROD_VARS.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    console.error(`\n❌ Missing required production environment variables:\n   ${missing.join(', ')}\n`);
    process.exit(1);
  }
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.error('\n❌ JWT_SECRET must be at least 32 characters in production.\n');
    process.exit(1);
  }
}

const connectDB = require('./config/db');
const { errorHandler, notFound } = require('./middleware/errorMiddleware');

// Routes
const authRoutes = require('./routes/authRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const reportRoutes = require('./routes/reportRoutes');
const triageRoutes = require('./routes/triageRoutes');

// Connect to MongoDB
connectDB();

const app = express();

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(helmet());

// ─── Middleware ────────────────────────────────────────────────────────────────

// CORS — restrict origins via env in production
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl) in dev
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS policy: origin ${origin} not allowed`));
      }
    },
    credentials: true,
  })
);

// Request body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// HTTP request logger (only in non-test environments)
if (process.env.NODE_ENV !== 'test') {
  // 'combined' gives richer logs in production; 'dev' is coloured for local dev
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'MediQ API', timestamp: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/triage', triageRoutes);

// ─── Error Handling ───────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🏥 MediQ API running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);

  // Inform operator which LLM provider is active (or if running rules-only)
  try {
    const llmRouter = require('./services/llm/llmRouter');
    const provider  = llmRouter.getProviderName();
    if (provider === 'none') {
      console.log('⚠️  No LLM provider configured — running in rule-based fallback mode.');
    } else {
      console.log(`🤖 LLM provider: ${provider}`);
    }
  } catch {
    // Non-fatal
  }
  console.log('');
});

module.exports = app;
