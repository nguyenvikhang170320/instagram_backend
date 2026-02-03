const express = require("express");
const { db, admin } = require("../firebase");
const uploadImage = require("../middlewares/upload");
const verifyToken = require("../middlewares/token");
const router = express.Router();
const cloudinary = require("cloudinary").v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
const uploadBufferToCloudinary = (buffer) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                resource_type: "image",
                folder: "instagram_flutter/avatars",
            },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );

        stream.end(buffer);
    });
};
//cập nhật user
router.put(
    "/update/:userId",
    verifyToken,
    uploadImage.single("avatar"),
    async (req, res) => {
        try {
            const { userId } = req.params;
            const loggedInUserId = req.user.uid;

            // 1) check quyền trước
            if (loggedInUserId !== userId) {
                return res.status(403).json({
                    success: false,
                    message: "Bạn không có quyền sửa hồ sơ của người khác!",
                });
            }

            const { username, fullname, bio } = req.body;

            const updateData = {
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            // 2) chỉ update field nào client gửi lên
            if (username !== undefined) updateData.username = username;
            if (fullname !== undefined) updateData.fullname = fullname;
            if (bio !== undefined) updateData.bio = bio;

            // 3) chỉ upload cloudinary khi có file avatar
            if (req.file) {
                const uploaded = await uploadBufferToCloudinary(req.file.buffer);
                updateData.avatar = uploaded.secure_url; // URL ảnh
                // nếu muốn: updateData.avatarPublicId = uploaded.public_id;
            }

            // 4) update firestore bằng object dữ liệu
            await db.collection("users").doc(userId).update(updateData);

            return res.status(200).json({
                success: true,
                message: "Cập nhật hồ sơ thành công",
                avatar: updateData.avatar, // có thì trả
            });
        } catch (error) {
            console.error("🔥 Lỗi cập nhật profile:", error);
            return res
                .status(500)
                .json({ success: false, message: "Lỗi server", error: error.message });
        }
    }
);

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
