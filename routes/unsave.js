const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const verifyToken = require("../middlewares/token");

// Thay đổi: Thêm verifyToken để bảo mật
router.post("/unsave", verifyToken, async (req, res) => {
    try {
        // Lấy userId trực tiếp từ Token
        const userId = req.user.uid;
        const { postId } = req.body;

        if (!postId) {
            return res.status(400).json({ message: "Thiếu postId" });
        }

        // Tạo reference dựa trên ID đã đặt lúc Save
        const savedPostRef = db.collection("saved_posts").doc(`${userId}_${postId}`);

        // Kiểm tra xem bài viết này có thực sự được lưu bởi user này không trước khi xóa (Optional nhưng an toàn)
        const doc = await savedPostRef.get();
        if (!doc.exists) {
            return res.status(404).json({ message: "Bài viết này chưa được lưu hoặc đã bị bỏ lưu trước đó" });
        }

        await savedPostRef.delete();

        res.status(200).json({ success: true, message: "Bỏ lưu bài viết thành công" });
    } catch (error) {
        console.error("🔥 Lỗi Unsave API:", error);
        res.status(500).json({ message: "Lỗi khi bỏ lưu bài viết", error: error.message });
    }
});

module.exports = router;