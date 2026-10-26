import "dotenv/config";

import express, { Request, Response } from "express";
import cors from "cors";
import connectDB from "./config/db";
import "./config/cloudinary";
import productRoutes from "./routes/productRoutes";
import stockRoutes from "./routes/Stockroutes";
import adminRoutes from "./routes/adminRoutes";
import authRoutes from "./routes/authRoutes";
import orderRoutes from "./routes/Orderroutes";
import notificationRoute from "./routes/notificationsRoute";
import categoryRoutes from "./routes/categoryRoutes";
import returnRoutes from "./routes/returnRoutes";
import complaintRoutes from "./routes/complaintRoutes";
import { ensureDefaultAdmin } from "./controllers/Admincontroller";
import { errorHandler } from "./middlewares/errorHandler";

const app = express();
const PORT = process.env.PORT ?? 5000;

if (!process.env.JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET is not set. Check your .env file.");
}

connectDB()
  .then(() => ensureDefaultAdmin())
  .catch((err) => {
    console.error("❌ DB connection failed:", err);
    process.exit(1);
  });

// ─── CORS ──────────────────────────────────────────────────────────────────────
// Mobile apps send no Origin header, so they are allowed through.
// Add any extra frontend/admin domains here (or via ALLOWED_ORIGINS env,
// comma-separated).
const allowedOrigins = [
  "https://thumpinfinity.com",
  "https://www.thumpinfinity.com",
  ...(process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : []),
];

if (process.env.NODE_ENV !== "production") {
  allowedOrigins.push("http://localhost:5173", "http://localhost:3000");
}

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
  }),
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "Product Management API is running 🚀" });
});

app.use("/api/products", productRoutes);
app.use("/api/stocks", stockRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/notifications", notificationRoute);
app.use("/api/categories", categoryRoutes);
app.use("/api/returns", returnRoutes);
app.use("/api/complaints", complaintRoutes);
app.use("/api/admin/categories", categoryRoutes);
app.use("/auth", authRoutes);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

export default app;