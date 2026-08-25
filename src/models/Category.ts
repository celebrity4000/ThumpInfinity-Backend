// src/models/Category.ts
import mongoose, { Schema, Document } from "mongoose";

export interface ICategory extends Document {
  categoryId: string;
  name: string;
  imageUrl?: string;
  icon?: string;
  color?: string;
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema = new Schema<ICategory>(
  {
    categoryId: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: "" },
    icon: { type: String, default: "📱" },
    color: { type: String, default: "#008080" },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

CategorySchema.index({ categoryId: 1 });
CategorySchema.index({ order: 1 });

export default mongoose.model<ICategory>("Category", CategorySchema);
