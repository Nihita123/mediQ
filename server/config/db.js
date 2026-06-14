/**
 * config/db.js — MongoDB connection via Mongoose
 *
 * Uses 127.0.0.1 explicitly to avoid IPv6 resolution issues on Windows.
 * Retries the connection up to 5 times before giving up.
 */

const mongoose = require('mongoose');

const MAX_RETRIES    = 5;
const RETRY_DELAY_MS = 3000;

const connectDB = async (attempt = 1) => {
  try {
    const uri = process.env.MONGO_URI;

    if (!uri) {
      console.error('❌ MONGO_URI is not set in your .env file');
      process.exit(1);
    }

    const conn = await mongoose.connect(uri);
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB connection error (attempt ${attempt}/${MAX_RETRIES}): ${error.message}`);

    if (attempt < MAX_RETRIES) {
      console.log(`   Retrying in ${RETRY_DELAY_MS / 1000}s...`);
      setTimeout(() => connectDB(attempt + 1), RETRY_DELAY_MS);
    } else {
      console.error('\n   ─────────────────────────────────────────────────────');
      console.error('   Could not connect to MongoDB after 5 attempts.');
      console.error('   Make sure MongoDB is running:');
      console.error('     Windows: net start MongoDB');
      console.error('     Or start MongoDB Compass / Atlas');
      console.error('   ─────────────────────────────────────────────────────\n');
      process.exit(1);
    }
  }
};

module.exports = connectDB;
