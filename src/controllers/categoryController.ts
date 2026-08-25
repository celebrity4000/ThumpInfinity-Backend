// src/controllers/categoryController.ts
import { Request, Response } from "express";
import Category from "../models/Category";
import Product from "../models/Product";
import { uploadToCloudinary } from "../utils/cloudinary";
import { sendSuccess, sendError } from "../utils/response";

// Default Categories Seed List (matching mobile app defaults)
const DEFAULT_CATEGORIES = [
  { id: "all", name: "All", icon: "📱", color: "#FF6B6B", order: 0 },
  { id: "charging-cables", name: "Charging Cables", icon: "🔌", color: "#4CAF50", order: 1 },
  { id: "chargers-adapters", name: "Chargers & Adapters", icon: "⚡", color: "#FF9800", order: 2 },
  { id: "power-banks", name: "Power Banks", icon: "🔋", color: "#2196F3", order: 3 },
  { id: "headphones-earphones", name: "Headphones & Earphones", icon: "🎧", color: "#9C27B0", order: 4 },
  { id: "speakers", name: "Speakers", icon: "🔊", color: "#E91E63", order: 5 },
  { id: "screen-protectors", name: "Screen Protectors", icon: "🛡️", color: "#607D8B", order: 6 },
  { id: "cases-covers", name: "Cases & Covers", icon: "📱", color: "#795548", order: 7 },
  { id: "mounts-stands", name: "Mounts & Stands", icon: "📐", color: "#00BCD4", order: 8 },
  { id: "cables-connectors", name: "Cables & Connectors", icon: "🔗", color: "#FF5722", order: 9 },
  { id: "storage-devices", name: "Storage Devices", icon: "💾", color: "#3F51B5", order: 10 },
  { id: "gaming-accessories", name: "Gaming Accessories", icon: "🎮", color: "#8BC34A", order: 11 },
  { id: "smartwatch-accessories", name: "Smartwatch Acc.", icon: "⌚", color: "#FFC107", order: 12 },
  { id: "keyboard-mouse", name: "Keyboard & Mouse", icon: "⌨️", color: "#009688", order: 13 },
  { id: "webcam-microphone", name: "Webcam & Microphone", icon: "📹", color: "#673AB7", order: 14 },
  { id: "other-accessories", name: "Other Accessories", icon: "🔧", color: "#F44336", order: 15 },
];

/**
 * Helper function to dynamically sync categories with unique categories in Product collection.
 */
const syncCategoriesWithProducts = async () => {
  try {
    const productCategories = await Product.distinct("category");
    for (const catName of productCategories) {
      if (!catName || typeof catName !== "string") continue;
      const normId = catName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const exists = await Category.findOne({ categoryId: normId });
      if (!exists) {
        const formattedName = catName
          .split("-")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");

        await Category.create({
          categoryId: normId,
          name: formattedName || catName,
          icon: "📱",
          color: "#008080",
          imageUrl: "",
          isActive: true,
          order: 99,
        });
      }
    }
  } catch (err) {
    console.error("Error syncing product categories:", err);
  }
};

/**
 * GET /api/categories
 * Public / App endpoint to fetch active categories & custom images.
 */
export const getCategories = async (req: Request, res: Response): Promise<void> => {
  try {
    let categories = await Category.find({ isActive: true }).sort({ order: 1 });

    if (categories.length === 0) {
      const seedDocs = DEFAULT_CATEGORIES.map((c) => ({
        categoryId: c.id,
        name: c.name,
        icon: c.icon,
        color: c.color,
        order: c.order,
        imageUrl: "",
        isActive: true,
      }));
      await Category.insertMany(seedDocs);
    }

    await syncCategoriesWithProducts();
    categories = await Category.find({ isActive: true }).sort({ order: 1 });

    sendSuccess(res, "Categories fetched successfully", categories, 200);
  } catch (err: any) {
    sendError(res, err.message || "Failed to fetch categories", err, 500);
  }
};

/**
 * GET /api/categories/admin/all
 * Admin endpoint to fetch all categories (including inactive & dynamic product categories).
 */
export const getAllCategoriesAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    let categories = await Category.find().sort({ order: 1 });

    if (categories.length === 0) {
      const seedDocs = DEFAULT_CATEGORIES.map((c) => ({
        categoryId: c.id,
        name: c.name,
        icon: c.icon,
        color: c.color,
        order: c.order,
        imageUrl: "",
        isActive: true,
      }));
      await Category.insertMany(seedDocs);
    }

    await syncCategoriesWithProducts();
    categories = await Category.find().sort({ order: 1 });

    sendSuccess(res, "All categories fetched for admin", categories, 200);
  } catch (err: any) {
    sendError(res, err.message || "Failed to fetch categories", err, 500);
  }
};

/**
 * PATCH /api/categories/:categoryId
 * Admin endpoint to update category image URL, name, icon, color, etc.
 */
export const updateCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { categoryId } = req.params;
    const { imageUrl, name, icon, color, order, isActive } = req.body;

    const normId = categoryId.trim().toLowerCase();

    let cat = await Category.findOne({ categoryId: normId });

    if (!cat) {
      cat = new Category({
        categoryId: normId,
        name: name || normId,
        imageUrl: imageUrl !== undefined ? imageUrl : "",
        icon: icon || "📱",
        color: color || "#008080",
        order: order || 0,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      });
    } else {
      if (imageUrl !== undefined) cat.imageUrl = imageUrl;
      if (name !== undefined) cat.name = name;
      if (icon !== undefined) cat.icon = icon;
      if (color !== undefined) cat.color = color;
      if (order !== undefined) cat.order = Number(order);
      if (isActive !== undefined) cat.isActive = Boolean(isActive);
    }

    await cat.save();

    sendSuccess(res, "Category updated successfully", cat, 200);
  } catch (err: any) {
    sendError(res, err.message || "Failed to update category", err, 500);
  }
};

/**
 * POST /api/categories/:categoryId/image
 * Admin endpoint to upload category image file to Cloudinary & update category.
 */
export const uploadCategoryImage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { categoryId } = req.params;

    if (!req.file) {
      sendError(res, "No image file uploaded", null, 400);
      return;
    }

    const result = await uploadToCloudinary(req.file.buffer, "categories");
    const normId = categoryId.trim().toLowerCase();

    let cat = await Category.findOne({ categoryId: normId });

    if (!cat) {
      cat = new Category({
        categoryId: normId,
        name: categoryId,
        imageUrl: result.secure_url,
        icon: "📱",
        color: "#008080",
        order: 99,
        isActive: true,
      });
    } else {
      cat.imageUrl = result.secure_url;
    }

    await cat.save();

    sendSuccess(res, "Category image uploaded successfully", cat, 200);
  } catch (err: any) {
    sendError(res, err.message || "Failed to upload category image", err, 500);
  }
};
