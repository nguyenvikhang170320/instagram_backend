const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const verifyToken = require("../middlewares/token");
const admin = require("firebase-admin");

// POST /api/report - Gửi báo cáo vi phạm
router.post("/", verifyToken, async (req, res) => {
    try {
        const reporterId = req.user.uid; // ID người thực hiện báo cáo (từ Token)
        const { targetId, targetType, reason, description } = req.body;

        /**
         * targetId: ID của đối tượng bị báo cáo (postId, videoId, hoặc userId)
         * targetType: Loại đối tượng ('post', 'video', 'user', 'comment')
         * reason: Lý do báo cáo (ví dụ: 'Spam', 'Nội dung nhạy cảm', 'Quấy rối')
         * description: Chi tiết thêm (nếu có)
         */

        if (!targetId || !targetType || !reason) {
            return res.status(400).json({ message: "Thiếu thông tin báo cáo bắt buộc" });
        }

        const reportData = {
            reporterId,
            targetId,
            targetType,
            reason,
            description: description || "",
            status: "pending", // Trạng thái xử lý: pending, reviewed, resolved
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        // Lưu vào collection "reports"
        const docRef = await db.collection("reports").add(reportData);

        res.status(201).json({
            success: true,
            message: "Cảm ơn bạn đã báo cáo. Chúng tôi sẽ xem xét nội dung này sớm nhất có thể.",
            reportId: docRef.id
        });

    } catch (error) {
        console.error("🔥 Lỗi gửi báo cáo:", error);
        res.status(500).json({ message: "Lỗi server khi gửi báo cáo", error: error.message });
    }
});

// GET /api/report/my-reports - Xem lại các báo cáo mình đã gửi
router.get("/my-reports", verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const snapshot = await db.collection("reports")
            .where("reporterId", "==", userId)
            .orderBy("createdAt", "desc")
            .get();

        const myReports = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt ? doc.data().createdAt.toDate().toISOString() : null
        }));

        res.json(myReports);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;