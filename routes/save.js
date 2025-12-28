const express = require("express");
const router = express.Router();
const verifyToken = require("../middlewares/token");
const { db } = require("../firebase");

router.post("/save", verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { postId, imageUrl } = req.body;
        if (!userId || !postId || !imageUrl) {
            return res.status(400).json({ message: "Thiếu dữ liệu" });
        }

        const savedPostRef = db.collection("saved_posts").doc(`${userId}_${postId}`);
        await savedPostRef.set({
            userId,
            postId,
            imageUrl,
            savedAt: new Date()
        });

        res.status(200).json({ message: "Lưu bài viết thành công" });
    } catch (error) {
        res.status(500).json({ message: "Lỗi khi lưu bài viết", error });
    }
});

module.exports = router;
