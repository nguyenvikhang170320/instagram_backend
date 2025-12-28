const express = require("express");
const router = express.Router();
const verifyToken = require("../middlewares/token");
const { db } = require("../firebase");
const admin = require("firebase-admin");

// 1. [POST] Thêm thông báo mới
// API này dùng khi bạn muốn tạo thông báo thủ công
router.post("/add", verifyToken, async (req, res) => {
    try {
        const senderId = req.user.uid; // Người tạo hành động (người gửi thông báo)
        const { receiverId, type, postId, message } = req.body;

        if (!receiverId || !type) {
            return res.status(400).json({ message: "Thiếu receiverId hoặc type" });
        }

        const newNotification = {
            senderId,
            receiverId,
            type, // 'like', 'comment', 'follow', v.v.
            postId: postId || null,
            message: message || "",
            isRead: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp() // Dùng thời gian server
        };

        const docRef = await db.collection("notifications").add(newNotification);

        res.status(201).json({
            success: true,
            notificationId: docRef.id,
            message: "Thêm thông báo thành công"
        });
    } catch (error) {
        console.error("🔥 Lỗi thêm thông báo:", error);
        res.status(500).json({ message: "Lỗi server khi thêm thông báo", error: error.message });
    }
});

// 2. [GET] Lấy danh sách thông báo của chính mình (Đã tối ưu Cache)
router.get("/", verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;

        const snapshot = await db.collection("notifications")
            .where("receiverId", "==", userId)
            .orderBy("createdAt", "desc")
            .limit(50)
            .get();

        if (snapshot.empty) return res.json([]);

        let notifications = [];
        let userCache = {};

        for (let doc of snapshot.docs) {
            let data = doc.data();
            let sId = data.senderId;

            if (sId) {
                if (!userCache[sId]) {
                    const userDoc = await db.collection("users").doc(sId).get();
                    userCache[sId] = userDoc.exists ? userDoc.data() : { username: "Người dùng", avatar: "" };
                }
                data.senderName = userCache[sId].username;
                data.senderAvatar = userCache[sId].avatar;
            }

            notifications.push({
                id: doc.id,
                ...data,
                createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null
            });
        }

        res.json(notifications);
    } catch (error) {
        console.error("🔥 Lỗi lấy thông báo:", error);
        res.status(500).json({ message: "Lỗi server" });
    }
});

// 3. [PUT] Đánh dấu đã đọc
router.put("/read/:notificationId", verifyToken, async (req, res) => {
    try {
        const { notificationId } = req.params;
        const userId = req.user.uid;

        const notiRef = db.collection("notifications").doc(notificationId);
        const doc = await notiRef.get();

        if (!doc.exists) return res.status(404).json({ message: "Không tìm thấy" });
        if (doc.data().receiverId !== userId) return res.status(403).json({ message: "Không có quyền" });

        await notiRef.update({ isRead: true });
        res.json({ success: true, message: "Đã đọc thông báo" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;