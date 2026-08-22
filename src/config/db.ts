import mongoose from "mongoose";
import dns from "dns";

// ── Fix Node.js DNS SRV resolution (querySrv ECONNREFUSED) ────────────────────
try {
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
  if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder("ipv4first");
  }
} catch (e) {
  console.warn("⚠️ Could not set custom DNS servers:", e);
}

const connectDB = async (): Promise<void> => {
  try {
    const uri = process.env.MONGODB_URI as string;
    await mongoose.connect(uri, {
      family: 4,
      serverSelectionTimeoutMS: 10000,
    });
    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error);
    process.exit(1);
  }
};

export default connectDB;
