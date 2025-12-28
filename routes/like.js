const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const verifyToken = require("../middlewares/token");
const db = admin.firestore();
const likesCollection = db.collection("likes");

// 1️⃣ Like bài viết
router.post("/like", verifyToken, async (req, res) => {
    try {
        // Lấy userId từ Token (req.user do verifyToken cung cấp)
        const userId = req.user.uid;
        const { postId } = req.body;
        if (!userId || !postId) {
            return res.status(400).json({ error: "Thiếu userId hoặc postId" });
        }

        const likeDoc = await likesCollection
            .where("userId", "==", userId)
            .where("postId", "==", postId)
            .get();

        if (!likeDoc.empty) {
            return res.status(400).json({ error: "Bạn đã like bài viết này" });
        }

        await likesCollection.add({ userId, postId, likedAt: new Date() });

        res.status(200).json({ message: "Đã like bài viết" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2️⃣ Bỏ like bài viết
router.delete("/unlike", async (req, res) => {
    try {
        const { userId, postId } = req.body;
        if (!userId || !postId) {
            return res.status(400).json({ error: "Thiếu userId hoặc postId" });
        }

        const likeDocs = await likesCollection
            .where("userId", "==", userId)
            .where("postId", "==", postId)
            .get();

        if (likeDocs.empty) {
            return res.status(400).json({ error: "Bạn chưa like bài viết này" });
        }

        likeDocs.forEach(async (doc) => await doc.ref.delete());

        res.status(200).json({ message: "Đã bỏ like bài viết" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3️⃣ Lấy danh sách like của bài viết (SỬA CODE)
router.get("/:postId", async (req, res) => {
    try {
        const { postId } = req.params;
        const likesSnapshot = await likesCollection.where("postId", "==", postId).get();

        const likeCount = likesSnapshot.size; // Đếm số lượt like

        if (likesSnapshot.empty) {
            return res.status(200).json({ likeCount: 0, likes: [] });
        }

        const likes = likesSnapshot.docs.map((doc) => doc.data().userId);
        res.status(200).json({ likeCount, likes }); // Trả về cả số lượt like và danh sách userId
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// API lấy danh sách bài viết mà người dùng đã like
router.get("/user/:userId", async (req, res) => {
    try {
        const userId = req.params.userId;
        const likesRef = db.collection("likes").where("userId", "==", userId);
        const snapshot = await likesRef.get();

        if (snapshot.empty) {
            return res.status(200).json([]); // Trả về mảng rỗng nếu chưa like bài nào
        }

        let likedPosts = [];
        snapshot.forEach((doc) => {
            likedPosts.push({ postId: doc.data().postId });
        });

        res.status(200).json(likedPosts);
    } catch (error) {
        console.error("❌ Lỗi khi lấy danh sách bài viết đã like:", error);
        res.status(500).json({ error: "Lỗi server" });
    }
});

module.exports = router;
