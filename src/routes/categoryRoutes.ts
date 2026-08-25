// src/routes/categoryRoutes.ts
import { Router } from "express";
import {
  getCategories,
  getAllCategoriesAdmin,
  updateCategory,
  uploadCategoryImage,
} from "../controllers/categoryController";
import { adminAuth } from "../middlewares/adminAuth";
import { uploadSingleImage } from "../middlewares/upload";

const router = Router();

// Category Routes (support both /admin/all, /all, and /)
router.get("/admin/all", getAllCategoriesAdmin);
router.get("/all", getAllCategoriesAdmin);
router.get("/", getCategories);

router.patch("/:categoryId", adminAuth, updateCategory);
router.post("/:categoryId/image", adminAuth, uploadSingleImage, uploadCategoryImage);

export default router;
