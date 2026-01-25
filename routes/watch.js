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
        folder: "instagram_flutter/watch",

        // ✅ Cấu hình để upload file lớn an toàn
        chunk_size: 6000000, // 6MB mỗi chunk (quan trọng cho mạng yếu)
        timeout: 600000,     // <--- TĂNG LÊN 10 PHÚT (600,000ms) để chờ convert xong

        // ✅ Cấu hình chuẩn hóa Video (Chống lỗi màn hình đen trên Android)
        format: "mp4",
        video_codec: "auto", // Để auto hoặc h264 đều được, auto sẽ tối ưu hơn
        audio_codec: "aac",
      },
      (error, result) => {
        if (error) {
          console.error("❌ Cloudinary Upload Error:", error);
          reject(error);
        } else {
          resolve(result.secure_url);
        }
      }
    );

    Readable.from(buffer).pipe(uploadStream);
  });
}

// ✅ Upload video (Sửa lại phần trả về JSON)
router.post("/upload", verifyToken, uploadVideo.single("video"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "Không tìm thấy file video" });

    const db = admin.firestore();
    const userId = req.user.uid;
    const { caption } = req.body;

    const userDoc = await db.collection("users").doc(userId).get();
    const u = userDoc.exists ? userDoc.data() : null;

    const username = u?.username || "Người dùng hệ thống";
    const avatar = u?.avatar || "";

    const videoUrl = await uploadToCloudinary(req.file.buffer);

    const docRef = await db.collection("videos").add({
      userId,
      caption: caption || "",
      videoUrl,
      username,
      avatar,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // --- Sửa ở đây: Thêm message thông báo ---
    return res.json({
      success: true,
      message: "Đăng video thành công!", // Thêm dòng này
      videoId: docRef.id,
      videoUrl,
    });
  } catch (error) {
    console.error("❌ Upload video error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});



// ✅ Videos theo userId (gộp user; nếu video đã denormalize thì vẫn OK)
router.get("/videos/:userId", verifyToken, async (req, res) => {
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
