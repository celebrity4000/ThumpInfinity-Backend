import { Request, Response, NextFunction } from "express";
import Order, { OrderStatus } from "../models/Order";
import Product from "../models/Product";
import User from "../models/Users";
import { sendSuccess, sendError } from "../utils/response";
import { sendPushNotification } from "../utils/pushNotification";
import { sendNewOrderAdminEmail } from "../utils/email";
import { calculateGSTByState, calculateCartGSTByState } from "../utils/taxUtils";
import { uploadBase64ToCloudinary } from "../utils/cloudinary";

// In your order controller, update the validation section:
const enrichAndValidateItems = async (
  rawItems: {
    productId?: string;
    product?: string;
    quantity: number;
  }[],
) => {
  const enriched = [];
  const errors: string[] = [];

  for (const raw of rawItems) {
    const productId = raw.productId || raw.product;

    if (!productId || !raw.quantity || raw.quantity < 1) {
      errors.push(`Invalid item: productId=${productId}`);
      continue;
    }

    const product = await Product.findById(productId).lean();
    if (!product) {
      errors.push(`Product not found: ${productId}`);
      continue;
    }
    if (!product.isActive) {
      errors.push(`Product is inactive: ${product.name}`);
      continue;
    }

    // ✅ Check minimum order quantity ONLY if limits are enforced
    if (
      product.enforceOrderLimits !== false &&
      product.minOrderQuantity &&
      raw.quantity < product.minOrderQuantity
    ) {
      errors.push(
        `Minimum order quantity for "${product.name}" is ${product.minOrderQuantity}. You tried to order ${raw.quantity}.`,
      );
      continue;
    }

    // ✅ Check maximum order quantity ONLY if limits are enforced
    if (
      product.enforceOrderLimits !== false &&
      product.maxOrderQuantity &&
      raw.quantity > product.maxOrderQuantity
    ) {
      errors.push(
        `Maximum order quantity for "${product.name}" is ${product.maxOrderQuantity}. You tried to order ${raw.quantity}.`,
      );
      continue;
    }

    // Check stock availability (always enforced)
    if (product.stockQuantity < raw.quantity) {
      errors.push(
        `Insufficient stock for "${product.name}". Available: ${product.stockQuantity}`,
      );
      continue;
    }

    // Get primary image from images array
    const primaryImage =
      product.images?.find((img: any) => img.isPrimary)?.url ??
      product.images?.[0]?.url ??
      undefined;

    // Convert specifications Map to plain object for storage
    const specs =
      product.specifications instanceof Map
        ? Object.fromEntries(product.specifications)
        : product.specifications || {};

    enriched.push({
      product: product._id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      type: product.type,
      color: product.color,
      warranty: product.warranty,
      imageUrl: primaryImage,
      images: product.images || [],
      specifications: specs,
      compatibility: product.compatibility || [],
      dimensions: product.dimensions,
      weight: product.weight,
      material: product.material,
      sellingPrice: product.sellingPrice,
      originalPrice: product.originalPrice,
      quantity: raw.quantity,
      gstRate: product.gstRate !== undefined ? product.gstRate : 18,
      lineTotal: product.sellingPrice * raw.quantity,
    });
  }

  return { enriched, errors };
};

// ─── PLACE ORDER ──────────────────────────────────────────────────────────────
// POST /api/orders
export const placeOrder = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const customerId = (req as any).user?._id;
    if (!customerId) {
      sendError(res, "Unauthorized", undefined, 401);
      return;
    }

    const {
      items,
      deliveryAddress,
      couponCode,
      couponDiscount = 0,
      deliveryCharge = 0,
      platformFee = 0,
      gst = 0,
      deliveryTip = 0,
      paymentMethod = "upi",
      transactionId,
      chequeNumber,
      bankName,
      paymentProofUrl,
    } = req.body;

    // ── Basic validation ──
    if (!items || !Array.isArray(items) || items.length === 0) {
      sendError(res, "Order must contain at least one item");
      return;
    }

    if (!deliveryAddress) {
      sendError(res, "Delivery address is required");
      return;
    }

    const { contactName, addressLine1, city, state, pincode, phone } =
      deliveryAddress;
    if (
      !contactName ||
      !addressLine1 ||
      !city ||
      !state ||
      !pincode ||
      !phone
    ) {
      sendError(
        res,
        "Delivery address must include: contactName, addressLine1, city, state, pincode, phone",
      );
      return;
    }

    // ── Cash on Delivery (COD) Delhi-Only Validation ──
    const isDelhiAddress =
      state.trim().toLowerCase().includes("delhi") ||
      city.trim().toLowerCase().includes("delhi") ||
      pincode.trim().startsWith("11");

    if (paymentMethod === "cod" && !isDelhiAddress) {
      sendError(
        res,
        "Cash on Delivery (COD) is available ONLY for customers located in Delhi. Please select an online/manual payment option.",
        undefined,
        400,
      );
      return;
    }

    // ── Enrich items from DB (validate stock, prices) ──
    const { enriched, errors } = await enrichAndValidateItems(items);

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        message: "Some items failed validation",
        errors,
      });
      return;
    }

    // ── Calculate state-based GST breakdown (CGST, SGST, IGST - GST Inclusive) ──
    const subtotal = enriched.reduce((sum, i) => sum + i.lineTotal, 0);
    const parsedCouponDiscount = Math.max(0, Number(couponDiscount) || 0);
    const netSubtotal = Math.max(0, subtotal - parsedCouponDiscount);
    const taxCalc = calculateCartGSTByState(enriched, state);
    const parsedDeliveryCharge = Math.max(0, Number(deliveryCharge) || 0);
    const parsedPlatformFee = Math.max(0, Number(platformFee) || 0);
    const parsedDeliveryTip = Math.max(0, Number(deliveryTip) || 0);

    const totalAmount =
      netSubtotal +
      parsedDeliveryCharge +
      parsedPlatformFee +
      parsedDeliveryTip;

    // ── Minimum order check ──
    const MIN_ORDER = 500;
    if (subtotal < MIN_ORDER) {
      sendError(
        res,
        `Minimum order value is ₹${MIN_ORDER}. Current subtotal is ₹${subtotal}.`,
        undefined,
        400,
      );
      return;
    }

    // ── Handle Credit / Wallet Balance Application ──
    const { useCreditBalance, creditAmountToApply } = req.body;
    let appliedCredit = 0;
    let remainingPayable = totalAmount;

    if (useCreditBalance) {
      const user = await User.findById(customerId);
      if (user && (user.creditBalance || 0) > 0) {
        const requestedCredit = Number(creditAmountToApply) || totalAmount;
        appliedCredit = Math.min(
          user.creditBalance || 0,
          Math.min(totalAmount, Math.max(0, requestedCredit)),
        );
        remainingPayable = totalAmount - appliedCredit;

        // Deduct applied credit from user balance
        user.creditBalance = Math.max(0, (user.creditBalance || 0) - appliedCredit);
        user.creditTransactions.push({
          amount: appliedCredit,
          type: "debit",
          description: `Applied towards Order payment`,
          createdAt: new Date(),
        });
        await user.save();
      }
    }

    // ── Handle Payment Proof Cloudinary Upload if Base64 ──
    let finalPaymentProofUrl = paymentProofUrl;
    if (finalPaymentProofUrl && typeof finalPaymentProofUrl === "string" && finalPaymentProofUrl.startsWith("data:image/")) {
      try {
        const cloudRes = await uploadBase64ToCloudinary(finalPaymentProofUrl, "payment_proofs");
        finalPaymentProofUrl = cloudRes.secure_url;
      } catch (cloudErr) {
        console.error("Cloudinary upload error for payment proof:", cloudErr);
      }
    }

    // ── Determine Payment Proof Status ──
    const hasProof = Boolean(finalPaymentProofUrl);
    const initialPaymentStatus = remainingPayable === 0
      ? "paid"
      : paymentMethod === "cod" 
      ? "pending" 
      : hasProof 
      ? "proof_submitted" 
      : "pending";
    const initialProofStatus = paymentMethod === "cod" || remainingPayable === 0
      ? "none"
      : hasProof
      ? "submitted"
      : "none";

    const isAutoApproved = paymentMethod === "cod" || remainingPayable === 0;
    const initialDeliveryOtp = isAutoApproved
      ? Math.floor(1000 + Math.random() * 9000).toString()
      : undefined;

    // ── Create order ──
    const order = new Order({
      customer: customerId,
      items: enriched,
      deliveryAddress: {
        contactName,
        addressLine1,
        addressLine2: deliveryAddress.addressLine2,
        city,
        state,
        pincode,
        phone,
      },
      subtotal,
      taxableAmount: taxCalc.taxableAmount,
      couponCode: couponCode || undefined,
      couponDiscount: parsedCouponDiscount,
      deliveryCharge: parsedDeliveryCharge,
      platformFee: parsedPlatformFee,
      cgst: taxCalc.cgst,
      sgst: taxCalc.sgst,
      igst: taxCalc.igst,
      gst: taxCalc.gst,
      gstRate: taxCalc.gstRate,
      taxType: taxCalc.taxType,
      deliveryTip: parsedDeliveryTip,
      totalAmount,
      creditAmountApplied: appliedCredit,
      remainingAmountPayable: remainingPayable,
      paymentMethod,
      paymentStatus: initialPaymentStatus,
      transactionId: transactionId || undefined,
      chequeNumber: chequeNumber || undefined,
      bankName: bankName || undefined,
      paymentProofUrl: finalPaymentProofUrl || undefined,
      paymentProofStatus: initialProofStatus,
      deliveryOtp: initialDeliveryOtp,
      status: "confirmed",
      statusHistory: [
        { status: "pending", timestamp: new Date(), note: "Order placed" },
        {
          status: "confirmed",
          timestamp: new Date(),
          note: hasProof
            ? `Order confirmed. Payment proof submitted (${paymentMethod.toUpperCase()})`
            : "Order confirmed",
        },
      ],
    });

    await order.save();

    // ── Decrement stock ──
    await Promise.all(
      enriched.map((item) =>
        Product.findByIdAndUpdate(item.product, {
          $inc: { stockQuantity: -item.quantity },
        }),
      ),
    );

    // ── Send Admin Email Notification ──
    try {
      sendNewOrderAdminEmail({
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        customerName: contactName,
        phone,
        deliveryAddress: {
          contactName,
          addressLine1,
          addressLine2: deliveryAddress.addressLine2,
          city,
          state,
          pincode,
          phone,
        },
        items: enriched.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          sellingPrice: i.sellingPrice,
          lineTotal: i.lineTotal,
          brand: i.brand,
          type: i.type,
          color: i.color,
        })),
        subtotal,
        couponDiscount: parsedCouponDiscount,
        totalAmount,
        paymentMethod,
        paymentStatus: initialPaymentStatus,
        transactionId: transactionId || undefined,
        chequeNumber: chequeNumber || undefined,
        bankName: bankName || undefined,
        paymentProofUrl: paymentProofUrl || undefined,
        createdAt: order.createdAt,
      }).catch((emailErr) =>
        console.error("Admin Email notification error:", emailErr),
      );
    } catch (e) {
      console.error("Failed to queue admin order email:", e);
    }

    // Populate for response
    const populated = await Order.findById(order._id).populate(
      "customer",
      "phone profile.contactName",
    );

    sendSuccess(res, "Order placed successfully", populated, 201);
  } catch (error) {
    next(error);
  }
};

const ensureOrderDeliveryOtp = async (o: any) => {
  if (!o) return o;
  const isApprovedPayment = o.paymentMethod === "cod" || o.paymentStatus === "paid";
  const isActiveStatus = ["confirmed", "processing", "out_for_delivery", "delivered", "completed"].includes(o.status);

  if (isApprovedPayment && isActiveStatus && !o.deliveryOtp) {
    const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString();
    o.deliveryOtp = generatedOtp;
    await Order.updateOne({ _id: o._id }, { $set: { deliveryOtp: generatedOtp } });
  }
  return o;
};

// ─── GET MY ORDERS (customer) ─────────────────────────────────────────────────
// GET /api/orders/my
export const getMyOrders = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const customerId = (req as any).user?._id;
    if (!customerId) {
      sendError(res, "Unauthorized", undefined, 401);
      return;
    }

    const { page = "1", limit = "10", status } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(50, parseInt(limit as string, 10));
    const skip = (pageNum - 1) * limitNum;

    const filter: Record<string, unknown> = { customer: customerId };
    if (status) filter.status = status;

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Order.countDocuments(filter),
    ]);

    await Promise.all(orders.map((o) => ensureOrderDeliveryOtp(o)));

    sendSuccess(res, "Orders fetched successfully", {
      orders,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET SINGLE ORDER ─────────────────────────────────────────────────────────
// GET /api/orders/:id
export const getOrderById = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const customerId = (req as any).user?._id;

    const order = await Order.findById(req.params.id)
      .populate("customer", "phone profile.contactName")
      .lean();

    if (!order) {
      sendError(res, "Order not found", undefined, 404);
      return;
    }

    // Customers can only see their own orders; admins can see all
    const role = (req as any).user?.role;
    if (
      role !== "admin" &&
      order.customer.toString() !== customerId?.toString()
    ) {
      sendError(res, "Forbidden", undefined, 403);
      return;
    }

    sendSuccess(res, "Order fetched successfully", order);
  } catch (error) {
    next(error);
  }
};

// ─── CANCEL ORDER (customer) ──────────────────────────────────────────────────
// PATCH /api/orders/:id/cancel
export const cancelOrder = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const customerId = (req as any).user?._id;
    const { reason } = req.body;

    const order = await Order.findById(req.params.id);
    if (!order) {
      sendError(res, "Order not found", undefined, 404);
      return;
    }

    if (order.customer.toString() !== customerId?.toString()) {
      sendError(res, "Forbidden", undefined, 403);
      return;
    }

    const nonCancellable: OrderStatus[] = [
      "out_for_delivery",
      "delivered",
      "cancelled",
    ];
    if (nonCancellable.includes(order.status)) {
      sendError(
        res,
        `Cannot cancel an order that is "${order.status}"`,
        undefined,
        400,
      );
      return;
    }

    // Restore stock
    await Promise.all(
      order.items.map((item) =>
        Product.findByIdAndUpdate(item.product, {
          $inc: { stockQuantity: item.quantity },
        }),
      ),
    );

    order.status = "cancelled";
    order.cancelledAt = new Date();
    order.cancellationReason = reason || "Cancelled by customer";
    order.statusHistory.push({
      status: "cancelled",
      timestamp: new Date(),
      note: reason || "Cancelled by customer",
    });

    await order.save();
    sendSuccess(res, "Order cancelled successfully", order);
  } catch (error) {
    next(error);
  }
};

// ─── UPDATE ORDER STATUS (admin) ──────────────────────────────────────────────
// PATCH /api/orders/:id/status  — admin only
export const updateOrderStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { status, note } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      sendError(res, "Order not found", undefined, 404);
      return;
    }

    const previousStatus = order.status;
    order.status = status;
    order.statusHistory.push({
      status,
      timestamp: new Date(),
      note: note || `Status updated to ${status}`,
    });

    // Generate Delivery OTP only if payment is approved (or COD)
    const isApprovedPayment = order.paymentMethod === "cod" || order.paymentStatus === "paid";
    if (isApprovedPayment && !order.deliveryOtp && (status === "confirmed" || status === "processing" || status === "out_for_delivery")) {
      order.deliveryOtp = Math.floor(1000 + Math.random() * 9000).toString();
    }

    await order.save();

    // ✅ Send push notification to customer
    const statusLabels: Record<string, string> = {
      confirmed: "Confirmed ✅",
      processing: "Processing 📦",
      out_for_delivery: "Out for Delivery 🚚",
      delivered: "Delivered 📬",
      cancelled: "Cancelled ❌",
    };

    let title = "Order Status Updated";
    if (status === "confirmed") {
      title = "Order Confirmed! 🚚";
    }

    // Get product names from order items
    const productNames = order.items.map((item) => item.name);
    let productNamesText = "";

    if (productNames.length === 1) {
      productNamesText = productNames[0];
    } else if (productNames.length === 2) {
      productNamesText = `${productNames[0]} and ${productNames[1]}`;
    } else if (productNames.length > 2) {
      productNamesText = `${productNames[0]} and ${productNames.length - 1} more item(s)`;
    }

    let body =
      productNames.length > 0
        ? `Your order containing ${productNamesText} is now ${statusLabels[status] || status}.`
        : `Your order is now ${statusLabels[status] || status}.`;

    if ((status === "confirmed" || status === "processing" || status === "out_for_delivery") && order.deliveryOtp) {
      body += ` Delivery OTP: ${order.deliveryOtp}. Share this OTP with the delivery agent.`;
    }

    await sendPushNotification(order.customer.toString(), title, body, {
      type: "order_status_update",
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      deliveryOtp: order.deliveryOtp,
      status: status,
      previousStatus: previousStatus,
      screen: "/(tabs)/myorders",
    });

    sendSuccess(res, "Order status updated", order);
  } catch (error) {
    next(error);
  }
};

// ─── UPDATE ORDER PAYMENT STATUS (admin) ──────────────────────────────────────
// PATCH /api/orders/:id/payment-status  — admin only
export const updateOrderPaymentStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { paymentStatus } = req.body;

    const validStatuses = ["pending", "paid", "failed", "refunded"];
    if (!validStatuses.includes(paymentStatus)) {
      sendError(res, "Invalid payment status", undefined, 400);
      return;
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      sendError(res, "Order not found", undefined, 404);
      return;
    }

    order.paymentStatus = paymentStatus;

    if (paymentStatus === "paid" && !order.deliveryOtp) {
      order.deliveryOtp = Math.floor(1000 + Math.random() * 9000).toString();
    }

    await order.save();

    // ── Push notification to customer on payment status change ──
    try {
      let title = "Payment Status Updated 💳";
      let body = `Payment status for Order #${order.orderNumber} has been updated to ${paymentStatus.toUpperCase()}.`;

      if (paymentStatus === "paid" && order.deliveryOtp) {
        title = "Payment Approved & Order Confirmed! 🚚";
        body += ` Your Delivery OTP is ${order.deliveryOtp}. Share this OTP with the delivery agent.`;
      }

      if (paymentStatus === "paid") {
        title = "Payment Confirmed! 🎉";
        body = `Your payment of ₹${order.totalAmount} for Order ${order.orderNumber} has been verified and marked as PAID.`;
      } else if (paymentStatus === "failed") {
        title = "Payment Failed ❌";
        body = `Payment for Order ${order.orderNumber} failed. Please contact support or retry.`;
      } else if (paymentStatus === "refunded") {
        title = "Refund Processed 💰";
        body = `Refund of ₹${order.totalAmount} for Order ${order.orderNumber} has been processed.`;
      }

      await sendPushNotification(order.customer.toString(), title, body, {
        type: "order_status_update",
        orderId: order._id.toString(),
        status: paymentStatus,
        screen: "/(tabs)/myorders",
      });
    } catch (pushErr) {
      console.error("Failed to send push notification on payment status update:", pushErr);
    }

    sendSuccess(res, "Order payment status updated", order);
  } catch (error) {
    next(error);
  }
};

// ─── GET ALL ORDERS (admin) ───────────────────────────────────────────────────
// GET /api/orders  — admin only
export const getAllOrders = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const {
      page = "1",
      limit = "20",
      status,
      customerId,
      from,
      to,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, parseInt(limit as string, 10));
    const skip = (pageNum - 1) * limitNum;

    // ✅ Filter out orders with deleted customers by default
    const filter: Record<string, unknown> = {
      customer: { $exists: true, $ne: null },
    };

    if (status) filter.status = status;

    // If specific customer is requested, override the default filter
    if (customerId) {
      filter.customer = customerId;
    }

    if (from || to) {
      filter.createdAt = {
        ...(from ? { $gte: new Date(from as string) } : {}),
        ...(to ? { $lte: new Date(to as string) } : {}),
      };
    }

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate(
          "customer",
          "phone profile.contactName profile.addressLine1 profile.addressLine2 profile.city profile.state profile.pincode profile.gstNumber",
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Order.countDocuments(filter),
    ]);

    await Promise.all(orders.map((o) => ensureOrderDeliveryOtp(o)));

    sendSuccess(res, "Orders fetched successfully", {
      orders,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── SUBMIT PAYMENT PROOF (Customer) ──────────────────────────────────────────
// PATCH /api/orders/:id/payment-proof
export const submitPaymentProof = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const customerId = (req as any).user?._id;
    const { id } = req.params;
    const { paymentProofUrl, transactionId, chequeNumber, bankName } = req.body;

    if (!customerId) {
      sendError(res, "Unauthorized", undefined, 401);
      return;
    }

    if (!paymentProofUrl) {
      sendError(res, "Payment proof image URL is required", undefined, 400);
      return;
    }

    const order = await Order.findOne({ _id: id, customer: customerId });
    if (!order) {
      sendError(res, "Order not found", undefined, 404);
      return;
    }

    let finalProofUrl = paymentProofUrl;
    if (finalProofUrl && typeof finalProofUrl === "string" && finalProofUrl.startsWith("data:image/")) {
      try {
        const cloudRes = await uploadBase64ToCloudinary(finalProofUrl, "payment_proofs");
        finalProofUrl = cloudRes.secure_url;
      } catch (cloudErr) {
        console.error("Cloudinary upload error for payment proof:", cloudErr);
      }
    }

    order.paymentProofUrl = finalProofUrl;
    if (transactionId) order.transactionId = transactionId;
    if (chequeNumber) order.chequeNumber = chequeNumber;
    if (bankName) order.bankName = bankName;

    order.paymentProofStatus = "submitted";
    order.paymentStatus = "proof_submitted";
    order.paymentProofRejectionReason = undefined;

    order.statusHistory.push({
      status: order.status,
      timestamp: new Date(),
      note: `Payment proof uploaded (${order.paymentMethod.toUpperCase()})`,
    });

    await order.save();

    sendSuccess(res, "Payment proof submitted successfully for verification", order);
  } catch (error) {
    next(error);
  }
};

// ─── VERIFY PAYMENT PROOF (Admin) ──────────────────────────────────────────────
// PATCH /api/orders/:id/verify-proof
export const verifyPaymentProof = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const { action, rejectionReason } = req.body as {
      action: "approve" | "reject";
      rejectionReason?: string;
    };

    if (!action || !["approve", "reject"].includes(action)) {
      sendError(res, "Action must be 'approve' or 'reject'", undefined, 400);
      return;
    }

    const order = await Order.findById(id);
    if (!order) {
      sendError(res, "Order not found", undefined, 404);
      return;
    }

    const adminId = (req as any).adminId;

    if (action === "approve") {
      order.paymentProofStatus = "verified";
      order.paymentStatus = "paid";
      order.paymentProofVerifiedAt = new Date();
      if (adminId) order.paymentProofVerifiedBy = adminId;

      if (order.status === "pending") {
        order.status = "confirmed";
      }

      // Generate Delivery OTP on payment approval
      if (!order.deliveryOtp) {
        order.deliveryOtp = Math.floor(1000 + Math.random() * 9000).toString();
      }

      order.statusHistory.push({
        status: order.status,
        timestamp: new Date(),
        note: `Payment proof verified & approved by admin. Delivery OTP: ${order.deliveryOtp}`,
      });

      await order.save();

      // Push notification to customer with Delivery OTP
      try {
        await sendPushNotification(
          order.customer.toString(),
          "Payment Verified & Confirmed! 🚚",
          `Your payment proof for Order #${order.orderNumber} has been verified & approved. Your Delivery OTP is ${order.deliveryOtp}. Share this OTP with the delivery agent.`,
          {
            type: "payment_verified",
            orderId: order._id.toString(),
            orderNumber: order.orderNumber,
            deliveryOtp: order.deliveryOtp,
            screen: "/(tabs)/myorders",
          },
        );
      } catch (err) {
        console.error("Failed to send push notification:", err);
      }

      sendSuccess(res, "Payment proof approved successfully", order);
    } else {
      order.paymentProofStatus = "rejected";
      order.paymentStatus = "rejected";
      order.paymentProofRejectionReason =
        rejectionReason || "Invalid payment proof provided";

      order.statusHistory.push({
        status: order.status,
        timestamp: new Date(),
        note: `Payment proof rejected: ${order.paymentProofRejectionReason}`,
      });

      await order.save();

      // Push notification to customer
      try {
        await sendPushNotification(
          order.customer.toString(),
          "Payment Proof Rejected ⚠️",
          `Your payment proof for Order ${order.orderNumber} was rejected: ${order.paymentProofRejectionReason}. Please re-upload proof.`,
          {
            type: "payment_rejected",
            orderId: order._id.toString(),
            screen: "/(tabs)/myorders",
          },
        );
      } catch (err) {
        console.error("Failed to send push notification:", err);
      }

      sendSuccess(res, "Payment proof rejected", order);
    }
  } catch (error) {
    next(error);
  }
};

// ─── GET CUSTOMER PAYMENT HISTORY ─────────────────────────────────────────────
// GET /api/orders/payments/history  — protected (customer)
export const getPaymentHistory = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const customerId = (req as any).user._id;

    // Fetch all orders placed by this customer sorted by latest
    const orders = await Order.find({ customer: customerId })
      .sort({ createdAt: -1 })
      .select(
        "orderNumber items totalAmount subtotal couponDiscount deliveryCharge platformFee gst paymentMethod paymentStatus transactionId chequeNumber bankName paymentProofUrl paymentProofStatus paymentProofVerifiedAt paymentProofRejectionReason status placedAt createdAt",
      )
      .lean();

    // Summary calculation
    let totalPaid = 0;
    let pendingVerification = 0;
    let refundedAmount = 0;

    orders.forEach((o) => {
      if (o.paymentStatus === "paid") {
        totalPaid += o.totalAmount;
      } else if (
        o.paymentStatus === "pending" ||
        o.paymentStatus === "proof_submitted"
      ) {
        pendingVerification += o.totalAmount;
      } else if (o.paymentStatus === "refunded") {
        refundedAmount += o.totalAmount;
      }
    });

    sendSuccess(
      res,
      "Payment history fetched successfully",
      {
        summary: {
          totalPaid,
          pendingVerification,
          refundedAmount,
          totalTransactions: orders.length,
        },
        records: orders,
      },
      200,
    );
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/orders/calculate-tax
 * Calculates state-based GST breakdown (CGST, SGST, IGST)
 */
export const calculateTax = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { subtotal = 0, state = "Delhi", sellerState = "Delhi", totalGstPercent = 18 } = req.body;
    const numericSubtotal = Math.max(0, Number(subtotal) || 0);

    const taxCalc = calculateGSTByState(
      numericSubtotal,
      String(state || "Delhi"),
      String(sellerState || "Delhi"),
      Number(totalGstPercent) || 18,
    );

    sendSuccess(res, "Tax calculated successfully", {
      subtotal: numericSubtotal,
      ...taxCalc,
    });
  } catch (err: any) {
    sendError(res, err.message || "Tax calculation error", err);
  }
};

// ─── VERIFY DELIVERY OTP (Customer) ─────────────────────────────────────────
// POST /api/orders/:id/verify-delivery-otp
export const verifyDeliveryOtp = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const customerId = (req as any).user?._id;
    const { id } = req.params;
    const { otp } = req.body;

    if (!otp || typeof otp !== "string") {
      sendError(res, "Delivery OTP is required", undefined, 400);
      return;
    }

    const filter: Record<string, unknown> = { _id: id };
    if (customerId) filter.customer = customerId;

    const order = await Order.findOne(filter);
    if (!order) {
      sendError(res, "Order not found", undefined, 404);
      return;
    }

    if (order.status === "delivered" || order.status === "completed") {
      sendError(res, "Order is already marked as Delivered", undefined, 400);
      return;
    }

    if (order.status === "cancelled") {
      sendError(res, "Cannot verify OTP for a cancelled order", undefined, 400);
      return;
    }

    // Verify OTP matches
    if (!order.deliveryOtp || order.deliveryOtp.trim() !== otp.trim()) {
      sendError(res, "Invalid Delivery OTP. Please enter the correct 4-digit OTP.", undefined, 400);
      return;
    }

    // Mark as delivered
    order.status = "delivered";
    order.deliveredAt = new Date();
    if (order.paymentMethod === "cod" && order.paymentStatus !== "paid") {
      order.paymentStatus = "paid";
    }

    order.statusHistory.push({
      status: "delivered",
      timestamp: new Date(),
      note: "Order delivered & verified via Customer Delivery OTP",
    });

    await order.save();

    // Send push notification to customer
    try {
      await sendPushNotification(
        order.customer.toString(),
        "Order Delivered! 📬",
        `Your order #${order.orderNumber} has been verified with Delivery OTP and marked as Delivered. Thank you!`,
        {
          type: "order_delivered",
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          screen: "/(tabs)/myorders",
        },
      );
    } catch (pushErr) {
      console.error("Failed to send push notification on OTP verification:", pushErr);
    }

    sendSuccess(res, "Delivery OTP verified! Order marked as Delivered successfully.", order);
  } catch (error) {
    next(error);
  }
};
