const express = require("express");
const { db } = require("../firebase");
const { cloudinary } = require("../cloudinary");
const upload = require("../middlewares/upload");
const verifyToken = require("../middlewares/token");
const router = express.Router();

// Cập nhật Profile
router.put("/update/:userId", verifyToken, async (req, res) => {
    try {
        const { userId } = req.params; // ID người dùng muốn sửa (trên URL)
        const loggedInUserId = req.user.uid; // ID người dùng thực sự (từ Token)

        // ✅ BẢO MẬT: Chặn nếu sửa hồ sơ của người khác
        if (loggedInUserId !== userId) {
            return res.status(403).json({
                success: false,
                message: "Bạn không có quyền sửa hồ sơ của người khác!"
            });
        }

        const { username, fullname, bio, avatar } = req.body;
        const userRef = db.collection("users").doc(userId);

        // Cập nhật dữ liệu
        await userRef.update({
            username: username || "",
            fullname: fullname || "",
            bio: bio || "",
            avatar: avatar || "",
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.status(200).json({
            success: true,
            message: "Cập nhật hồ sơ thành công"
        });

    } catch (error) {
        console.error("🔥 Lỗi cập nhật profile:", error);
        res.status(500).json({ message: "Lỗi server", error: error.message });
    }
});
// 📌 API lấy thông tin user theo userId, load trang profile
router.get('/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const userDoc = await db.collection('users').doc(userId).get();

        if (!userDoc.exists) {
            return res.status(404).json({ error: "Không tìm thấy người dùng" });
        }

        const userData = userDoc.data();
        console.log(`🔹 Danh sách following từ Firestore:`, userData);

        return res.json({
            userId: userId,
            username: userData.username || "",
            fullname: userData.fullname || "",
            bio: userData.bio || "",
            avatar: userData.avatar || ""
        });
    } catch (error) {
        console.error("🔥 Lỗi lấy user:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
//API để lấy danh sách người dùng để search
router.get("/all/:currentUserId", async (req, res) => {
    try {
        const currentUserId = req.params.currentUserId;
        const usersRef = db.collection("users");
        const snapshot = await usersRef.get();

        // ✅ Lấy danh sách những người currentUserId đang follow
        const followingSnapshot = await db.collection("following")
            .doc(currentUserId).collection("following").get();
        let followingIds = followingSnapshot.docs.map(doc => doc.id);

        let users = [];
        snapshot.forEach((doc) => {
            if (doc.id !== currentUserId) { // ❌ Bỏ qua user đang đăng nhập
                users.push({
                    userId: doc.id,
                    username: doc.data().username,
                    fullname: doc.data().fullname || "",
                    avatar: doc.data().avatar || "",
                    bio: doc.data().bio || "",
                    isFollowing: followingIds.includes(doc.id) // 🔹 Kiểm tra đã follow chưa
                });
            }
        });

        return res.status(200).json(users);
    } catch (error) {
        console.error("Lỗi lấy danh sách người dùng:", error);
        return res.status(500).json({ error: "Lỗi server" });
    }
});

module.exports = router;
