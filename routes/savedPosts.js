const express = require("express");
const router = express.Router();
const verifyToken = require("../middlewares/token");
const { db } = require("../firebase");

router.get('/saved-posts', verifyToken, async (req, res) => {
    try {
        // Sửa lỗi: req.user.uid thay vì req.user.userId
        const userId = req.user.uid;

        const snapshot = await db.collection('saved_posts')
            .where('userId', '==', userId)
            // .orderBy('savedAt', 'desc') // Nếu muốn bài mới lưu hiện lên đầu
            .get();

        if (snapshot.empty) {
            return res.json([]);
        }

        let savedPosts = snapshot.docs.map(doc => ({
            postId: doc.data().postId,
            imageUrl: doc.data().imageUrl
        }));

        res.json(savedPosts);
    } catch (error) {
        console.error("Lỗi lấy bài viết đã lưu:", error);
        res.status(500).json({ message: "Lỗi server" });
    }
});

module.exports = router;
