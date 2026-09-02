import mongoose, { Document, Schema } from "mongoose";

export type ComplaintStatus = "pending" | "investigating" | "resolved" | "rejected";

export interface IComplaint extends Document {
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
  status: ComplaintStatus;
  adminNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ComplaintSchema = new Schema<IComplaint>(
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
      enum: ["pending", "investigating", "resolved", "rejected"],
      default: "pending",
    },
    adminNote: { type: String, trim: true },
  },
  { timestamps: true }
);

export default mongoose.model<IComplaint>("Complaint", ComplaintSchema);
