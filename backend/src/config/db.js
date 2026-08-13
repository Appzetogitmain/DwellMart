import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const maxPoolSize = Math.max(Number(process.env.MONGO_MAX_POOL_SIZE) || 20, 5);
    const minPoolSize = Math.max(Number(process.env.MONGO_MIN_POOL_SIZE) || 5, 0);

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected. Attempting to reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected successfully.');
    });

    const conn = await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize,
      minPoolSize,
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      family: 4, // Use IPv4 for faster DNS lookup resolution
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

/**
 * Report whether the connected deployment can run multi-document transactions.
 *
 * Checkout, order cancellation and rider withdrawal all call
 * `session.withTransaction`. On a standalone `mongod` every one of those throws
 * at runtime with an opaque driver error, so the condition is detected once at
 * boot rather than per request.
 *
 * @returns {Promise<{ supportsTransactions: boolean, topology: string, setName: string|null }>}
 */
export const getTransactionSupport = async () => {
  try {
    const admin = mongoose.connection.db.admin();
    const info = await admin.command({ hello: 1 });
    const setName = info?.setName || null;
    const isSharded = info?.msg === 'isdbgrid';
    // Replica sets support transactions from 4.0; sharded clusters from 4.2.
    const supportsTransactions = Boolean(setName) || isSharded;
    return {
      supportsTransactions,
      topology: isSharded ? 'sharded' : setName ? 'replicaSet' : 'standalone',
      setName,
    };
  } catch (error) {
    // An inability to introspect is not proof of absence; report unknown and
    // let the caller decide. Never fail closed on a permissions error here.
    console.warn(`⚠️ Could not determine MongoDB topology: ${error.message}`);
    return { supportsTransactions: false, topology: 'unknown', setName: null };
  }
};

/**
 * Fail fast when transactions are unavailable in production.
 * In non-production this warns, so local standalone development still works.
 */
export const assertTransactionSupport = async () => {
  const status = await getTransactionSupport();
  const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

  if (status.supportsTransactions) {
    console.log(`✅ MongoDB topology: ${status.topology} — transactions supported`);
    return status;
  }

  const message =
    `MongoDB topology is "${status.topology}" — multi-document transactions are NOT available. `
    + 'Checkout, order cancellation and rider withdrawals will fail at runtime.';

  if (isProduction) {
    throw new Error(message);
  }

  console.warn(`⚠️ ${message} (allowed outside production)`);
  return status;
};

export default connectDB;
