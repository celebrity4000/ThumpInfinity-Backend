import { Request, Response, NextFunction } from "express";
import Order from "../models/Order";
import Complaint from "../models/Complaint";
import { sendSuccess, sendError } from "../utils/response";

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
    }> = [];

    orders.forEach((order) => {
      (order.items || []).forEach((item: any) => {
        const primaryImg = item.images?.find((img: any) => img.isPrimary) || item.images?.[0];
        items.push({
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          orderDate: order.deliveredAt || order.placedAt || order.createdAt,
          productId: item.product ? item.product.toString() : item._id.toString(),
          productName: item.name,
          productImage: item.imageUrl || primaryImg?.url || "https://via.placeholder.com/150",
          productPrice: item.sellingPrice || 0,
          quantity: item.quantity || 1,
          billNumber: order.orderNumber,
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
      .populate("customer", "contactName phone email profile")
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

    sendSuccess(res, `Complaint ${status} successfully`, { complaint });
  } catch (error) {
    next(error);
  }
};
