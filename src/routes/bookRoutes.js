import express from "express";
import Book from "../models/Book.js";
import cloudinary from "../lib/cloudinary.js";
import protectRoute from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/", protectRoute, async (req, res) => {
  try {
    const { title, caption, rating, image } = req.body;
    console.log(title, caption, rating);

    if (!title || !caption || !rating || !image) {
      return res.status(400).json({ message: "Please provide all fields" });
    }

    // Convert base64 data URL to buffer for Cloudinary
    const base64Data = image.replace(/^data:image\/[a-z]+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // upload image to cloudinary using buffer
    const uploadResponse = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: "auto",
          folder: "book-covers",
          public_id: `book_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`,
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );5

      uploadStream.end(buffer);
    });

    const imageUrl = uploadResponse.secure_url;
    // save to the database
    const newBook = new Book({
      title,
      caption,
      rating,
      image: imageUrl,
      user: req.user._id,
    });

    await newBook.save();

    res.status(201).json(newBook);
  } catch (error) {
    console.log("Error Creating ", error);
    res.status(500).json({ message: error.message });
  }
});

// pagination infinte loading
router.get("/", async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 5;
    const skip = (page - 1) * limit;
    const books = await Book.find()
      .sort({ createdAt: -1 }) //descending
      .skip(skip)
      .limit(limit)
      .populate("user", "username profileImage");

    const totalBooks = await Book.countDocuments();
    console.log(books);
    
    res.send({
      books,
      currentPage: page,
      totalBooks,
      totalPages: Math.ceil(totalBooks / limit),
    });
  } catch (error) {
    console.log("Error in get all books route", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/user", protectRoute, async (req, res) => {
  try {
    const books = await Book.find({ user: req.user._id }).sort({
      createdAt: -1,
    });
    res.json(books);
  } catch (error) {
    console.error("Get user books error:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
});

router.delete("/:id",protectRoute, async function (req, res) {
  try {
    const book = await Book.findById(req.params.id);
    
    if (!book) return res.status(404).json({ message: "Book not found" });

    // check if useris the creater of the book
    if (book.user.toString() !== req.user._id.toString())
      return res.status(401).json({ message: "Unauthorized" });

    // delete the imagee from cloudinary as well
    if (book.image && book.image.includes("cloudinary")) {
      try {
        const publicId = book.image.split("/").pop().split(".")[0];
        await cloudinary.uploader.destroy(publicId);
      } catch (deleteError) {
        console.log("Error deleting image from cloudinary", deleteError);
      }
    }

    await book.deleteOne();

    res.json({ message: "Book deleted successfully" });
  } catch (error) {
    console.log("Error deleting book", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;