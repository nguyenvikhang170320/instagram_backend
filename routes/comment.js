const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const verifyToken = require("../middlewares/token");
const { FieldValue } = require("firebase-admin/firestore");


router.post("/comment", verifyToken, async (req, res) => {
    try {
        // Lấy userId từ Token (req.user do verifyToken cung cấp)
        const userId = req.user.uid;
        const { postId, commentText } = req.body;
        if (!postId || !userId || !commentText) {
            return res.status(400).json({ message: "Thiếu dữ liệu đầu vào!" });
        }

        // Tạo document reference trước để lấy ID
        const commentRef = db.collection("comments").doc();
        const commentId = commentRef.id; // ✅ Lấy document ID làm commentId

        const newComment = {
            commentId, // ✅ Lưu luôn commentId vào Firestore
            postId,
            userId,
            commentText,
            createdAt: FieldValue.serverTimestamp()
        };

        await commentRef.set(newComment); // ✅ Lưu dữ liệu với commentId

        res.status(201).json(newComment); // ✅ Trả về commentId trong response
    } catch (error) {
        res.status(500).json({ message: "Lỗi server!", error });
    }
});


// API lấy danh sách bình luận theo postId
router.get("/comments/:postId", async (req, res) => {
    try {
        const postId = req.params.postId;
        const commentsSnapshot = await db.collection("comments")
            .where("postId", "==", postId)
            .orderBy("createdAt", "desc") // Nên thêm sắp xếp
            .get();

        let comments = [];
        let userCache = {}; // ✅ Cache để tránh đọc 1 user nhiều lần

        for (let doc of commentsSnapshot.docs) {
            let commentData = doc.data();
            let cUserId = commentData.userId;

            if (!userCache[cUserId]) {
                let userSnapshot = await db.collection("users").doc(cUserId).get();
                if (userSnapshot.exists) {
                    userCache[cUserId] = userSnapshot.data();
                } else {
                    userCache[cUserId] = { username: "Người dùng Facebook", avatar: "" };
                }
            }

            comments.push({
                commentId: commentData.commentId,
                username: userCache[cUserId].username || "",
                avatar: userCache[cUserId].avatar || "",
                commentText: commentData.commentText,
                createdAt: commentData.createdAt
            });
        }
        res.status(200).json(comments);
    } catch (error) {
        res.status(500).json({ message: "Lỗi khi lấy bình luận!", error: error.message });
    }
});



// API lấy số lượng bình luận theo postId
router.get("/comments/count/:postId", async (req, res) => {
    try {
        const { postId } = req.params;
        const commentsSnapshot = await db.collection("comments").where("postId", "==", postId).get();
        const commentCount = commentsSnapshot.size; // Lấy số lượng comment

        res.status(200).json({ postId, commentCount });
    } catch (error) {
        res.status(500).json({ message: "Lỗi server!", error });
    }
});

// Xóa bình luận từ collection "comments"
router.delete("/comments/delete/:commentId", verifyToken, async (req, res) => {
    try {
        const { commentId } = req.params;
        const userId = req.user.uid; // ✅ Lấy UID từ token an toàn

        const commentRef = db.collection("comments").doc(commentId);
        const commentDoc = await commentRef.get();

        if (!commentDoc.exists) {
            return res.status(404).json({ error: "Bình luận không tồn tại!" });
        }

        const commentData = commentDoc.data();

        // ✅ Kiểm tra chủ sở hữu an toàn hơn
        if (commentData.userId !== userId) {
            return res.status(403).json({ error: "Bạn không có quyền xóa bình luận này!" });
        }

        await commentRef.delete();
        res.status(200).json({ message: "Xóa bình luận thành công" });
    } catch (error) {
        res.status(500).json({ error: "Lỗi khi xóa bình luận", details: error.message });
    }
});


module.exports = router;
