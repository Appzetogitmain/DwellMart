import "dotenv/config";
import mongoose from "mongoose";
import User from "../src/models/User.model.js";

const email = process.env.TEST_USER_EMAIL || "testuser@example.com";
const password = process.env.TEST_USER_PASSWORD || "Test@1234";
const name = process.env.TEST_USER_NAME || "Test User";
const phone = process.env.TEST_USER_PHONE || "9999999999";

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI is not set in environment");
    process.exit(1);
  }
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB");

  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    let user = await User.findOne({ email: normalizedEmail }).select(
      "+password",
    );
    if (user) {
      user.name = name;
      user.phone = phone;
      user.password = password; // will be hashed by pre-save hook
      user.isVerified = true;
      user.isActive = true;
      await user.save();
      console.log("Updated existing test user:", normalizedEmail);
    } else {
      user = await User.create({
        name,
        email: normalizedEmail,
        password,
        phone,
        isVerified: true,
        isActive: true,
        role: "customer",
      });
      console.log("Created new test user:", normalizedEmail);
    }
  } catch (err) {
    console.error("Failed to create/update test user:", err.message);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
    process.exit(0);
  }
}

main();
