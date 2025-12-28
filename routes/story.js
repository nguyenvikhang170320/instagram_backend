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


// 1. Đăng Story (Đã tối ưu với Promise và userId từ Token)
router.post("/upload", verifyToken, upload.single("image"), async (req, res) => {
    const userId = req.user.uid; // Lấy từ Token

    try {
        if (!req.file) return res.status(400).json({ error: "Không có file được tải lên!" });

        console.log("📤 Đang upload story cho user:", userId);

        // Bọc Cloudinary vào Promise để xử lý mượt mà hơn
        const result = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream(
                { folder: "instagram_flutter/stories" },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            ).end(req.file.buffer);
        });

        const storyId = uuidv4();
        const newStory = {
            storyId,
            userId,
            imageUrl: result.secure_url,
            viewers: [],
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        await db.collection("stories").doc(storyId).set(newStory);

        res.json({ success: true, message: "Đăng story thành công!", story: newStory });

    } catch (error) {
        console.error("❌ Lỗi upload story:", error);
        res.status(500).json({ error: "Lỗi server khi đăng story" });
    }
});

// 2. Lấy danh sách Story (Đã tối ưu tốc độ truy vấn user)
router.get("/list", async (req, res) => {
    try {
        const snapshot = await db.collection("stories").orderBy("createdAt", "desc").get();
        let groupedStories = {};
        let userCache = {}; // Dùng để tránh truy vấn lại 1 user nhiều lần

        for (let doc of snapshot.docs) {
            let story = doc.data();
            let userId = story.userId;

            if (!groupedStories[userId]) {
                // Kiểm tra xem đã lấy info user này chưa
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
                viewersCount: story.viewers ? story.viewers.length : 0
            });
        }
        res.json(Object.values(groupedStories));
    } catch (error) {
        console.error("Lỗi lấy danh sách stories:", error);
        res.status(500).json({ error: "Lỗi server" });
    }
});


// 📌 Đánh dấu người dùng đã xem Story (Lưu vào danh sách viewers)
router.post("/:storyId/view", async (req, res) => {
    try {
        const { storyId } = req.params;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ error: "Thiếu userId" });
        }

        const storyRef = db.collection("stories").doc(storyId);
        const storyDoc = await storyRef.get();

        if (!storyDoc.exists) {
            return res.status(404).json({ error: "Story không tồn tại" });
        }

        await storyRef.update({
            viewers: admin.firestore.FieldValue.arrayUnion(userId),
        });
        console.log("Story: " + storyRef);
        console.log("Story: " + storyDoc);
        res.json({ success: true, message: "Đã thêm vào danh sách viewers" });
    } catch (error) {
        console.error("🔥 Lỗi khi cập nhật viewers:", error);
        res.status(500).json({ error: "Lỗi server" });
    }
});

// 📌 Lấy danh sách người đã xem Story
// router.get("/:storyId/viewers", async (req, res) => {
//     try {
//         const { storyId } = req.params;
//         const storyDoc = await db.collection("stories").doc(storyId).get();

//         if (!storyDoc.exists) {
//             return res.status(404).json({ error: "Story không tồn tại" });
//         }

//         const storyData = storyDoc.data();
//         const viewers = storyData.viewers || [];

//         if (viewers.length === 0) {
//             return res.json([]); // Không có ai xem
//         }

//         // 🔥 Lấy thông tin tối đa 100 người xem
//         const viewerDetails = await Promise.all(
//             viewers.slice(0, 100).map(async (userId) => {
//                 const userDoc = await db.collection("users").doc(userId).get();
//                 if (!userDoc.exists) return null;

//                 const userData = userDoc.data();
//                 return {
//                     userId,
//                     username: userData.username || "Unknown",
//                     avatar: userData.avatar || "",
//                 };
//             })
//         );

//         res.json(viewerDetails.filter(user => user !== null));
//     } catch (error) {
//         console.error("🔥 Lỗi lấy viewers:", error);
//         res.status(500).json({ error: "Lỗi server" });
//     }
// });

module.exports = router;
