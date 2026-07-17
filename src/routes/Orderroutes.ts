import { Router } from "express";
import {
  placeOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  updateOrderStatus,
  updateOrderPaymentStatus,
  getAllOrders,
} from "../controllers/Ordercontroller";
import { protect } from "../middlewares/authMiddleware";
import { adminAuth } from "../middlewares/adminAuth";

const router = Router();

// Customer routes (User JWT)
router.post("/", protect, placeOrder);
router.get("/my", protect, getMyOrders);
router.get("/:id", protect, getOrderById);
router.patch("/:id/cancel", protect, cancelOrder);

// Admin routes (Admin JWT)
router.get("/", adminAuth, getAllOrders);
router.patch("/:id/status", adminAuth, updateOrderStatus);
router.patch("/:id/payment-status", adminAuth, updateOrderPaymentStatus);

export default router;
