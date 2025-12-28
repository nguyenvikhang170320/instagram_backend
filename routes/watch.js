const express = require("express");
const cloudinary = require("cloudinary").v2;
const admin = require("firebase-admin");
const router = express.Router();
const upload = require("../middlewares/upload");
const verifyToken = require("../middlewares/token");
// 🟢 Cấu hình Multer để lưu video vào bộ nhớ


const { Readable } = require("stream"); // 🟢 Thêm dòng này

// 🟢 Cấu hình Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 🟢 Hàm upload video lên Cloudinary bằng Promise
async function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: "video", chunk_size: 6000000, folder: "instagram_flutter/watch" }, // Chia nhỏ thành 6MB mỗi chunk
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result.secure_url);
        }
      }
    );

    // Đẩy buffer vào stream
    Readable.from(buffer).pipe(uploadStream);
  });
}

// ✅ API Upload Video
router.post("/upload", verifyToken, upload.single("video"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file" });

    const userId = req.user.uid; // Đảm bảo an toàn
    const { caption } = req.body;

    const videoUrl = await uploadToCloudinary(req.file.buffer);

    const docRef = await admin.firestore().collection("videos").add({
      userId,
      caption: caption || "",
      videoUrl,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true, videoId: docRef.id, videoUrl });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// API lấy danh sách video Watch
router.get("/videos", async (req, res) => {
  try {
    const videosSnapshot = await admin.firestore()
      .collection("videos")
      .orderBy("createdAt", "desc")
      .get();

    // Kiểm tra nếu collection rỗng
    if (videosSnapshot.empty) {
      return res.json({ success: true, videos: [] });
    }

    // Chuyển đổi dữ liệu Firestore
    const videos = videosSnapshot.docs.map(doc => {
      const data = doc.data();

      return {
        id: doc.id,
        caption: data.caption || "",  // Fix lỗi null
        videoUrl: data.videoUrl || "", // Fix lỗi null
        userId: data.userId || "", // Fix lỗi null
        createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null
      };
    });

    res.json({ success: true, videos });

  } catch (error) {
    console.error("🔥 Lỗi lấy danh sách video:", error);
    res.status(500).json({ error: "Lỗi server" });
  }
});

//api lấy video theo userId
router.get("/videos/:userId", async (req, res) => {
  const { userId } = req.params; // Chỉ lấy userId từ URL
  console.log("📥 Nhận request lấy video của userId:", userId);

  try {
    // 1. Lấy thông tin người dùng (username, avatar) từ collection "users"
    const userDoc = await admin.firestore().collection("users").doc(userId).get();

    let userData = {
      username: "Người dùng hệ thống",
      avatar: ""
    };

    if (userDoc.exists) {
      const data = userDoc.data();
      userData.username = data.username || userData.username;
      userData.avatar = data.avatar || userData.avatar;
    }

    // 2. Lấy danh sách video của user đó
    const snapshot = await admin.firestore()
      .collection("videos")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .get();

    console.log(`📦 Tìm thấy ${snapshot.size} video(s) cho userId ${userId}`);

    // 3. Gộp thông tin user vào từng video
    const videos = snapshot.docs.map(doc => {
      const videoData = doc.data();
      return {
        id: doc.id,
        ...videoData,
        username: userData.username, // Thêm username vào đây
        avatar: userData.avatar,     // Thêm avatar vào đây
        // Chuyển đổi timestamp sang ISO string để Flutter dễ đọc
        createdAt: videoData.createdAt ? videoData.createdAt.toDate().toISOString() : null
      };
    });

    console.log("✅ Dữ liệu video gửi về kèm thông tin user thành công");

    res.json({
      success: true,
      videos
    });
  } catch (error) {
    console.error("❌ Lỗi khi lấy video:", error);
    res.status(500).json({ success: false, message: "Lỗi server khi lấy video" });
  }
});

router.delete("/delete/:videoId", verifyToken, async (req, res) => {
  try {
    const { videoId } = req.params;
    const userId = req.user.uid;

    const videoRef = admin.firestore().collection("videos").doc(videoId);
    const doc = await videoRef.get();

    if (!doc.exists) return res.status(404).json({ message: "Video không tồn tại" });
    if (doc.data().userId !== userId) return res.status(403).json({ message: "Không có quyền xóa" });

    await videoRef.delete();
    // Lưu ý: Bạn cũng nên viết thêm logic để xóa file trên Cloudinary bằng public_id
    res.json({ success: true, message: "Đã xóa video" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
