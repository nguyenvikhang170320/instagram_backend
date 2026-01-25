const express = require("express");
const { v4: uuidv4 } = require("uuid");
const admin = require("firebase-admin");
const cloudinary = require("cloudinary").v2;
const router = express.Router();
const upload = require("../middlewares/upload");
const verifyToken = require("../middlewares/token");
const { db } = require("../firebase");

// Cấu hình Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ==========================================
// 1. ĐĂNG STORY (Có tính thời gian hết hạn 24h)
// ==========================================
router.post("/upload", verifyToken, upload.single("image"), async (req, res) => {
    const userId = req.user.uid; // Lấy an toàn từ Token

    try {
        if (!req.file) return res.status(400).json({ error: "Không có file được tải lên!" });

        // Upload lên Cloudinary
        const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                { folder: "instagram_flutter/stories" },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            stream.end(req.file.buffer);
        });

        const storyId = uuidv4();
        const now = admin.firestore.Timestamp.now();
        // Tính thời gian hết hạn (24 giờ sau)
        const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);

        const newStory = {
            storyId,
            userId,
            imageUrl: result.secure_url,
            publicId: result.public_id, // Lưu cái này để sau này xóa ảnh trên Cloudinary
            viewers: [],
            createdAt: now,
            expiresAt: expiresAt, // Quan trọng: dùng để lọc story cũ
        };

        await db.collection("stories").doc(storyId).set(newStory);

        res.json({ success: true, message: "Đăng story thành công!", story: newStory });

    } catch (error) {
        console.error("❌ Lỗi upload story:", error);
        res.status(500).json({ error: "Lỗi server khi đăng story" });
    }
});

// ==========================================
// 2. LẤY DANH SÁCH STORY (FEED)
// Logic: Chỉ lấy story chưa hết hạn (expiresAt > now)
// ==========================================
router.get("/list", verifyToken, async (req, res) => {
    try {
        const now = admin.firestore.Timestamp.now();

        // Query: Lấy stories chưa hết hạn, sắp xếp mới nhất
        // LƯU Ý: Bạn cần tạo Index trong Firestore Console cho (expiresAt ASC, createdAt DESC)
        const snapshot = await db.collection("stories")
            .where("expiresAt", ">", now)
            .orderBy("expiresAt", "asc") 
            .orderBy("createdAt", "desc")
            .get();

        let groupedStories = {};
        let userCache = {}; 

        for (let doc of snapshot.docs) {
            let story = doc.data();
            let userId = story.userId;

            // Optional: Logic lọc theo Follow (Chỉ hiện story của người mình follow)
            // Nếu bạn có list following trong req.user, hãy check ở đây.
            // if (!myFollowingList.includes(userId) && userId !== req.user.uid) continue;

            if (!groupedStories[userId]) {
                if (!userCache[userId]) {
                    const userDoc = await db.collection("users").doc(userId).get();
                    userCache[userId] = userDoc.exists ? userDoc.data() : { username: "Unknown", avatar: "" };
                }

                groupedStories[userId] = {
                    userId,
                    username: userCache[userId].username,
                    avatar: userCache[userId].avatar,
                    stories: []
                };
            }

            groupedStories[userId].stories.push({
                storyId: doc.id,
                imageUrl: story.imageUrl,
                createdAt: story.createdAt,
                isViewed: story.viewers ? story.viewers.includes(req.user.uid) : false, // Check xem mình xem chưa
                viewersCount: story.viewers ? story.viewers.length : 0
            });
        }
        res.json(Object.values(groupedStories));
    } catch (error) {
        console.error("❌ Lỗi lấy danh sách stories:", error);
        res.status(500).json({ error: "Lỗi server" });
    }
});

// ==========================================
// 3. XEM STORY (Đánh dấu đã xem)
// Sửa lỗi: Lấy userId từ token, không lấy từ body
// ==========================================
router.post("/:storyId/view", verifyToken, async (req, res) => {
    try {
        const { storyId } = req.params;
        const userId = req.user.uid; // Lấy từ Token (Bảo mật)

        const storyRef = db.collection("stories").doc(storyId);
        
        // Dùng update để tối ưu, không cần get() trước nếu không cần thiết
        await storyRef.update({
            viewers: admin.firestore.FieldValue.arrayUnion(userId),
        });

        res.json({ success: true, message: "Đã đánh dấu xem story" });
    } catch (error) {
        console.error("❌ Lỗi khi cập nhật viewers:", error);
        res.status(500).json({ error: "Lỗi server" });
    }
});

// ==========================================
// 4. LẤY CHI TIẾT NGƯỜI ĐÃ XEM (Chỉ chủ Story mới xem được)
// ==========================================
router.get("/:storyId/viewers", verifyToken, async (req, res) => {
    try {
        const { storyId } = req.params;
        const currentUserId = req.user.uid;

        const storyDoc = await db.collection("stories").doc(storyId).get();

        if (!storyDoc.exists) {
            return res.status(404).json({ error: "Story không tồn tại" });
        }

        const storyData = storyDoc.data();

        // BẢO MẬT: Chỉ chủ sở hữu story mới được xem danh sách người xem
        if (storyData.userId !== currentUserId) {
            return res.status(403).json({ error: "Bạn không có quyền xem danh sách này" });
        }

        const viewers = storyData.viewers || [];
        if (viewers.length === 0) return res.json([]);

        // Lấy thông tin user (giới hạn 50 người mới nhất để đỡ lag)
        const viewerDetails = await Promise.all(
            viewers.slice(0, 50).map(async (uid) => {
                const userDoc = await db.collection("users").doc(uid).get();
                if (!userDoc.exists) return null;
                const uData = userDoc.data();
                return {
                    userId: uid,
                    username: uData.username || "Unknown",
                    avatar: uData.avatar || "",
                    fullname: uData.fullname || ""
                };
            })
        );

        res.json(viewerDetails.filter(user => user !== null));
    } catch (error) {
        console.error("❌ Lỗi lấy viewers:", error);
        res.status(500).json({ error: "Lỗi server" });
    }
});

// ==========================================
// 5. XÓA STORY (Chủ story xóa trước 24h)
// ==========================================
// ==========================================
// 5. XÓA STORY (Updated: Bỏ qua lỗi Cloudinary nếu mạng lag)
// ==========================================
router.delete("/:storyId", verifyToken, async (req, res) => {
    try {
        const { storyId } = req.params;
        const currentUserId = req.user.uid;

        const storyRef = db.collection("stories").doc(storyId);
        const storyDoc = await storyRef.get();

        if (!storyDoc.exists) return res.status(404).json({ error: "Story không tồn tại" });

        const storyData = storyDoc.data();

        // Kiểm tra quyền sở hữu
        if (storyData.userId !== currentUserId) {
            return res.status(403).json({ error: "Không có quyền xóa story này" });
        }

        // 1. Cố gắng xóa ảnh trên Cloudinary (Bọc trong try-catch riêng)
        if (storyData.publicId) {
            try {
                await cloudinary.uploader.destroy(storyData.publicId);
                console.log("✅ Đã xóa ảnh trên Cloudinary");
            } catch (cloudError) {
                // Nếu lỗi mạng, chỉ log ra chứ không chặn quy trình
                console.error("⚠️ Lỗi kết nối Cloudinary (bỏ qua):", cloudError.message);
            }
        }

        // 2. Xóa trong Database (Luôn thực hiện dù Cloudinary có lỗi hay không)
        await storyRef.delete();

        res.json({ success: true, message: "Đã xóa story" });
    } catch (error) {
        console.error("❌ Lỗi xóa story:", error);
        res.status(500).json({ error: "Lỗi server" });
    }
});

module.exports = router;