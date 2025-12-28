const express = require("express");
const cloudinary = require("cloudinary").v2;
const router = express.Router();
const { db } = require("../firebase");
const upload = require("../middlewares/upload");
const verifyToken = require("../middlewares/token");
require("dotenv").config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});


//upload ảnh
router.post("/upload", verifyToken, upload.single("image"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: "No file uploaded" });

        // Lấy UID từ Token để đảm bảo chính chủ
        const userId = req.user.uid;
        const { caption } = req.body;

        // Upload Cloudinary (giữ nguyên logic Promise của bạn - rất tốt)
        const result = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream({
                resource_type: "image",
                folder: "instagram_flutter/post"
            }, (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }).end(req.file.buffer);
        });

        const postId = db.collection("posts").doc().id;
        await db.collection("posts").doc(postId).set({
            postId,
            userId, // Dùng ID từ token
            imageUrl: result.secure_url,
            caption,
            createdAt: admin.firestore.FieldValue.serverTimestamp(), // Nên dùng serverTimestamp
        });

        res.json({ postId, imageUrl: result.secure_url, message: "Upload successful!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// API: Lấy danh sách bài viết của user
router.get("/:userId", async (req, res) => {
    try {
        const userId = req.params.userId;
        const postsRef = db.collection("posts")
            .where("userId", "==", userId)
            .orderBy("createdAt", "desc"); // Vì createdAt là timestamp, ta có thể order trực tiếp

        const snapshot = await postsRef.get();

        if (snapshot.empty) {
            return res.status(200).json([]);
        }

        let posts = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            posts.push({
                id: doc.id,
                userId: data.userId,
                imageUrl: data.imageUrl,
                caption: data.caption,
                createdAt: data.createdAt.toDate(), // Convert timestamp về Date
            });
        });

        res.status(200).json(posts);
    } catch (error) {
        console.error("Lỗi khi lấy danh sách bài viết:", error);
        res.status(500).json({ message: "Lỗi server" });
    }
});

// DELETE /api/posts/:postId - Xóa bài viết
router.delete("/:postId", verifyToken, async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.user.uid; // ID của người đang đăng nhập

        const postRef = db.collection("videos").doc(postId); // Giả sử bạn lưu video/post chung ở collection 'videos'
        const doc = await postRef.get();

        // 1. Kiểm tra bài viết có tồn tại không
        if (!doc.exists) {
            return res.status(404).json({ message: "Bài viết không tồn tại" });
        }

        // 2. BẢO MẬT: Kiểm tra xem người xóa có phải là chủ bài viết không
        if (doc.data().userId !== userId) {
            return res.status(403).json({ message: "Bạn không có quyền xóa bài viết của người khác" });
        }

        // 3. Thực hiện xóa bài viết và các dữ liệu liên quan (Dùng Batch để tối ưu)
        const batch = db.batch();

        // Xóa chính bài viết
        batch.delete(postRef);

        // (Tùy chọn) Xóa các comment của bài viết này
        const commentsSnapshot = await db.collection("comments").where("postId", "==", postId).get();
        commentsSnapshot.forEach((commentDoc) => {
            batch.delete(commentDoc.ref);
        });

        // (Tùy chọn) Xóa các lượt like của bài viết này
        const likesSnapshot = await db.collection("likes").where("postId", "==", postId).get();
        likesSnapshot.forEach((likeDoc) => {
            batch.delete(likeDoc.ref);
        });

        await batch.commit();

        res.status(200).json({
            success: true,
            message: "Đã xóa bài viết và các dữ liệu liên quan thành công"
        });

    } catch (error) {
        console.error("🔥 Lỗi khi xóa bài viết:", error);
        res.status(500).json({ message: "Lỗi server", error: error.message });
    }
});

module.exports = router;
