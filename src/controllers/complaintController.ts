import { Request, Response, NextFunction } from "express";
import Order from "../models/Order";
import Complaint from "../models/Complaint";
import { sendSuccess, sendError } from "../utils/response";
import { sendPushNotification } from "../utils/pushNotification";

/**
 * GET /api/complaints/eligible-products
 * Returns all products purchased by the customer eligible for filing complaints
 */
export const getEligibleProducts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const customerId = (req as any).user?._id;
    if (!customerId) {
      sendError(res, "Unauthorized", undefined, 401);
      return;
    }

    const orders = await Order.find({
      customer: customerId,
      status: { $ne: "cancelled" },
    })
      .sort({ createdAt: -1 })
      .lean();

    // Fetch existing complaints for this customer to cross-reference status
    const existingComplaints = await Complaint.find({ customer: customerId })
      .sort({ createdAt: -1 })
      .lean();

    const complaintMap = new Map<string, any>();
    existingComplaints.forEach((c) => {
      const key = `${c.order.toString()}_${c.product.toString()}`;
      if (!complaintMap.has(key)) {
        complaintMap.set(key, c);
      }
    });

    const items: Array<{
      orderId: string;
      orderNumber: string;
      orderDate: Date | string;
      productId: string;
      productName: string;
      productImage?: string;
      productPrice: number;
      quantity: number;
      billNumber: string;
      complaint?: any;
    }> = [];

    orders.forEach((order) => {
      (order.items || []).forEach((item: any) => {
        const primaryImg = item.images?.find((img: any) => img.isPrimary) || item.images?.[0];
        const pId = item.product ? item.product.toString() : item._id.toString();
        const key = `${order._id.toString()}_${pId}`;
        const activeComplaint = complaintMap.get(key) || null;

        items.push({
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          orderDate: order.deliveredAt || order.placedAt || order.createdAt,
          productId: pId,
          productName: item.name,
          productImage: item.imageUrl || primaryImg?.url || "https://via.placeholder.com/150",
          productPrice: item.sellingPrice || 0,
          quantity: item.quantity || 1,
          billNumber: order.orderNumber,
          complaint: activeComplaint,
        });
      });
    });

    sendSuccess(res, "Eligible complaint products fetched successfully", { items });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/complaints
 * Create a new Product Complaint
 */
export const createComplaint = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const customerId = (req as any).user?._id;
    if (!customerId) {
      sendError(res, "Unauthorized", undefined, 401);
      return;
    }

    const {
      orderId,
      productId,
      productName,
      productImage,
      productPrice,
      quantity,
      billNumber,
      reason,
      description,
      photos,
    } = req.body;

    if (!orderId || !productId || !billNumber || !reason || !description) {
      sendError(res, "Please fill in all required fields (Bill Number, Reason & Description).", undefined, 400);
      return;
    }

    // Check if complaint already exists for this order & product
    const existingComplaint = await Complaint.findOne({
      order: orderId,
      product: productId,
      customer: customerId,
      status: { $in: ["pending", "investigating", "resolved"] },
    });

    if (existingComplaint) {
      sendError(
        res,
        `A complaint has already been submitted for this product (${existingComplaint.status.toUpperCase()}).`,
        undefined,
        400
      );
      return;
    }

    const complaint = await Complaint.create({
      order: orderId,
      customer: customerId,
      product: productId,
      productName: productName || "Purchased Product",
      productImage: productImage || "",
      productPrice: Number(productPrice) || 0,
      quantity: Number(quantity) || 1,
      billNumber,
      reason,
      description,
      photos: Array.isArray(photos) ? photos : [],
      status: "pending",
    });

    // Mark order as having a complaint
    await Order.findByIdAndUpdate(orderId, { hasComplaint: true });

    sendSuccess(res, "Complaint filed successfully! Our team will inspect and reach out.", { complaint }, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/complaints/my
 * Fetch customer's own complaints
 */
export const getMyComplaints = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const customerId = (req as any).user?._id;
    const complaints = await Complaint.find({ customer: customerId })
      .sort({ createdAt: -1 })
      .lean();

    sendSuccess(res, "Complaints fetched successfully", { complaints });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/complaints/admin/all
 * Fetch all complaints for Admin Panel
 */
export const getAllComplaintsAdmin = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const complaints = await Complaint.find()
      .populate("customer", "contactName name phone email profile")
      .populate("order", "orderNumber totalAmount status")
      .sort({ createdAt: -1 })
      .lean();

    sendSuccess(res, "Admin complaints fetched successfully", { complaints });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/complaints/admin/:id/status
 * Admin update complaint status
 */
export const updateComplaintStatusAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, adminNote } = req.body;

    if (!["pending", "investigating", "resolved", "rejected"].includes(status)) {
      sendError(res, "Invalid status value", undefined, 400);
      return;
    }

    const complaint = await Complaint.findById(id);
    if (!complaint) {
      sendError(res, "Complaint not found", undefined, 404);
      return;
    }

    complaint.status = status;
    if (adminNote) complaint.adminNote = adminNote;
    await complaint.save();

    // Trigger FCM & DB push notification to customer
    try {
      const statusLabels: Record<string, string> = {
        investigating: "UNDER INVESTIGATION",
        resolved: "RESOLVED",
        rejected: "REJECTED",
        pending: "PENDING",
      };
      const formattedStatus = statusLabels[status] || status.toUpperCase();
      const title = `Complaint Status Update: ${formattedStatus}`;
      const noteText = adminNote ? ` Admin note: ${adminNote}` : "";
      const body = `Your complaint for "${complaint.productName}" (Order: ${complaint.billNumber}) is now ${formattedStatus}.${noteText}`;

      await sendPushNotification(complaint.customer.toString(), title, body, {
        type: "approval_status",
        screen: "complaints",
        status,
        complaintId: complaint._id.toString(),
      });
    } catch (pushErr) {
      console.error("Failed to send push notification for complaint status:", pushErr);
    }

    sendSuccess(res, `Complaint ${status} successfully`, { complaint });
  } catch (error) {
    next(error);
  }
};
