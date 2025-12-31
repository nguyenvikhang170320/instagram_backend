const express = require("express");
const cloudinary = require("cloudinary").v2;
const admin = require("firebase-admin");
const { Readable } = require("stream");
const router = express.Router();
const uploadVideo = require("../middlewares/upload_video");
const verifyToken = require("../middlewares/token");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "video",
        chunk_size: 6000000,
        folder: "instagram_flutter/watch",
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );

    Readable.from(buffer).pipe(uploadStream);
  });
}

// ✅ Upload video (denormalize username/avatar)
router.post("/upload", verifyToken, uploadVideo.single("video"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file" });


    const db = admin.firestore();
    const userId = req.user.uid;
    const { caption } = req.body;

    // lấy user để lưu kèm username/avatar
    const userDoc = await db.collection("users").doc(userId).get();
    const u = userDoc.exists ? userDoc.data() : null;

    const username = u?.username || "Người dùng hệ thống";
    const avatar = u?.avatar || "";

    const videoUrl = await uploadToCloudinary(req.file.buffer);

    const docRef = await db.collection("videos").add({
      userId,
      caption: caption || "",
      videoUrl,
      username, // denormalize
      avatar,   // denormalize
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({
      success: true,
      videoId: docRef.id,
      videoUrl,
    });
  } catch (error) {
    console.error("❌ Upload video error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ Feed videos: trả kèm username/avatar (fallback join cho video cũ)
router.get("/videos", async (req, res) => {
  try {
    const db = admin.firestore();

    const snap = await db.collection("videos").orderBy("createdAt", "desc").get();
    if (snap.empty) return res.json({ success: true, videos: [] });

    const rawVideos = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        caption: data.caption || "",
        videoUrl: data.videoUrl || "",
        userId: data.userId || "",
        username: data.username || null, // có thể null nếu video cũ
        avatar: data.avatar || null,     // có thể null nếu video cũ
        createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
      };
    });

    // những video chưa có username/avatar thì join users
    const needJoin = rawVideos.filter((v) => !v.username || v.avatar === null);
    if (needJoin.length === 0) {
      return res.json({ success: true, videos: rawVideos });
    }

    const userIds = [...new Set(needJoin.map((v) => v.userId).filter(Boolean))];
    const userRefs = userIds.map((uid) => db.collection("users").doc(uid));
    const userDocs = userRefs.length ? await db.getAll(...userRefs) : [];

    const userMap = {};
    for (const d of userDocs) {
      const u = d.exists ? d.data() : null;
      userMap[d.id] = {
        username: u?.username || "Người dùng hệ thống",
        avatar: u?.avatar || "",
      };
    }

    const videos = rawVideos.map((v) => ({
      ...v,
      username: v.username || userMap[v.userId]?.username || "Người dùng hệ thống",
      avatar: v.avatar ?? userMap[v.userId]?.avatar ?? "",
    }));

    return res.json({ success: true, videos });
  } catch (error) {
    console.error("🔥 Lỗi lấy danh sách video:", error);
    return res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// ✅ Videos theo userId (gộp user; nếu video đã denormalize thì vẫn OK)
router.get("/videos/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const db = admin.firestore();

    // user info
    const userDoc = await db.collection("users").doc(userId).get();
    const u = userDoc.exists ? userDoc.data() : null;

    const username = u?.username || "Người dùng hệ thống";
    const avatar = u?.avatar || "";

    // videos by user
    const snap = await db
      .collection("videos")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .get();

    if (snap.empty) return res.json({ success: true, videos: [] });

    const videos = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        caption: data.caption || "",
        videoUrl: data.videoUrl || "",
        userId: data.userId || userId,
        username: data.username || username,
        avatar: data.avatar || avatar,
        createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
      };
    });

    return res.json({ success: true, videos });
  } catch (error) {
    console.error("❌ Lỗi khi lấy video:", error);
    return res.status(500).json({ success: false, message: "Lỗi server khi lấy video" });
  }
});

// ✅ Delete video
router.delete("/delete/:videoId", verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    const { videoId } = req.params;
    const userId = req.user.uid;

    const videoRef = db.collection("videos").doc(videoId);
    const doc = await videoRef.get();

    if (!doc.exists) return res.status(404).json({ success: false, message: "Video không tồn tại" });
    if (doc.data().userId !== userId) {
      return res.status(403).json({ success: false, message: "Không có quyền xóa" });
    }

    await videoRef.delete();
    return res.json({ success: true, message: "Đã xóa video" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
