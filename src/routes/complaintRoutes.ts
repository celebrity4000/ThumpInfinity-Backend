import { Router } from "express";
import { protect } from "../middlewares/authMiddleware";
import { adminAuth } from "../middlewares/adminAuth";
import {
  getEligibleProducts,
  createComplaint,
  getMyComplaints,
  getAllComplaintsAdmin,
  updateComplaintStatusAdmin,
} from "../controllers/complaintController";

const router = Router();

// Customer routes
router.get("/eligible-products", protect, getEligibleProducts);
router.post("/", protect, createComplaint);
router.get("/my", protect, getMyComplaints);

// Admin routes
router.get("/admin/all", adminAuth, getAllComplaintsAdmin);
router.put("/admin/:id/status", adminAuth, updateComplaintStatusAdmin);

export default router;
