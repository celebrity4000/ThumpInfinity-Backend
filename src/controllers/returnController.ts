import { Request, Response, NextFunction } from "express";
import Order from "../models/Order";
import ReturnRequest from "../models/ReturnRequest";
import { sendSuccess, sendError } from "../utils/response";

/**
 * GET /api/returns/purchased-products
 * Returns all products purchased by the customer from delivered/completed orders
 */
export const getPurchasedProducts = async (
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

    const deliveredOrders = await Order.find({
      customer: customerId,
      status: { $in: ["delivered", "completed"] },
    })
      .sort({ createdAt: -1 })
      .lean();

    const purchasedItems: Array<{
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

    deliveredOrders.forEach((order) => {
      (order.items || []).forEach((item: any) => {
        const primaryImg = item.images?.find((img: any) => img.isPrimary) || item.images?.[0];
        purchasedItems.push({
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

    sendSuccess(res, "Purchased products fetched successfully", { items: purchasedItems });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/returns
 * Create a new Purchase Return request
 */
export const createReturnRequest = async (
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
      sendError(res, "Please fill in all required fields (Order, Product, Bill #, Reason & Description).", undefined, 400);
      return;
    }

    const returnReq = await ReturnRequest.create({
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

    sendSuccess(res, "Purchase Return Request submitted successfully!", { returnRequest: returnReq }, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/returns/my
 * Fetch customer's own return requests
 */
export const getMyReturnRequests = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const customerId = (req as any).user?._id;
    const requests = await ReturnRequest.find({ customer: customerId })
      .sort({ createdAt: -1 })
      .lean();

    sendSuccess(res, "Return requests fetched successfully", { requests });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/returns/admin/all
 * Fetch all return requests for Admin Panel
 */
export const getAllReturnRequestsAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const requests = await ReturnRequest.find()
      .populate("customer", "contactName phone email profile")
      .populate("order", "orderNumber totalAmount status")
      .sort({ createdAt: -1 })
      .lean();

    sendSuccess(res, "Admin return requests fetched successfully", { requests });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/returns/admin/:id/status
 * Admin approve / reject return request
 */
export const updateReturnStatusAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, adminNote } = req.body;

    if (!["approved", "rejected", "completed"].includes(status)) {
      sendError(res, "Invalid status value", undefined, 400);
      return;
    }

    const returnReq = await ReturnRequest.findById(id);
    if (!returnReq) {
      sendError(res, "Return request not found", undefined, 404);
      return;
    }

    returnReq.status = status;
    if (adminNote) returnReq.adminNote = adminNote;
    await returnReq.save();

    sendSuccess(res, `Return request ${status} successfully`, { returnRequest: returnReq });
  } catch (error) {
    next(error);
  }
};
