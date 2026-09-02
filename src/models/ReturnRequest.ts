import mongoose, { Document, Schema } from "mongoose";

export type ReturnStatus = "pending" | "approved" | "rejected" | "completed";

export interface IReturnRequest extends Document {
  order: mongoose.Types.ObjectId;
  customer: mongoose.Types.ObjectId;
  product: mongoose.Types.ObjectId;
  productName: string;
  productImage?: string;
  productPrice: number;
  quantity: number;
  billNumber: string;
  reason: string;
  description: string;
  photos: string[];
  status: ReturnStatus;
  adminNote?: string;
  requestedAt: Date;
  updatedAt: Date;
}

const ReturnRequestSchema = new Schema<IReturnRequest>(
  {
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    customer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true, trim: true },
    productImage: { type: String, trim: true },
    productPrice: { type: Number, required: true },
    quantity: { type: Number, required: true, default: 1 },
    billNumber: { type: String, required: true, trim: true },
    reason: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    photos: [{ type: String, trim: true }],
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "completed"],
      default: "pending",
    },
    adminNote: { type: String, trim: true },
    requestedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model<IReturnRequest>("ReturnRequest", ReturnRequestSchema);
