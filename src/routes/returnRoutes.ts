import { Router } from "express";
import { protect } from "../middlewares/authMiddleware";
import { adminAuth } from "../middlewares/adminAuth";
import {
  getPurchasedProducts,
  createReturnRequest,
  getMyReturnRequests,
  getAllReturnRequestsAdmin,
  updateReturnStatusAdmin,
} from "../controllers/returnController";

const router = Router();

// Customer routes
router.get("/purchased-products", protect, getPurchasedProducts);
router.post("/", protect, createReturnRequest);
router.get("/my", protect, getMyReturnRequests);

// Admin routes
router.get("/admin/all", adminAuth, getAllReturnRequestsAdmin);
router.put("/admin/:id/status", adminAuth, updateReturnStatusAdmin);

export default router;
