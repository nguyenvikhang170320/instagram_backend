const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { db } = require('../firebase');
const upload = require("../middlewares/upload");
const verifyToken = require('../middlewares/token');
const cloudinary = require("cloudinary").v2;

// cloudinary.config({
//     cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//     api_key: process.env.CLOUDINARY_API_KEY,
//     api_secret: process.env.CLOUDINARY_API_SECRET,
// });
// POST /api/messages/send - Gửi tin nhắn text
router.post('/send-text', verifyToken, async (req, res) => {
  try {
    const senderId = req.user.uid;
    const { chatId, text } = req.body;

    if (!chatId) {
      return res.status(400).json({ message: 'Thiếu chatId' });
    }

    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Thiếu nội dung tin nhắn' });
    }

    const timestamp = new Date();

    const messageData = {
      chatId,
      senderId,
      text,
      type: 'text',
      mediaUrl: null,
      status: 'sent',
      createdAt: timestamp,
    };

    const messageRef = await db.collection('messages').add(messageData);

    await db.collection('chats').doc(chatId).update({
      lastMessage: text,
      updatedAt: timestamp,
    });

    res.status(201).json({
      id: messageRef.id,
      ...messageData,
      createdAt: new Date().toISOString(),
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// POST /api/messages/send - Gửi tin nhắn image/video
// gửi tin nhắn ảnh / video
router.post(
  "/send-media",
  verifyToken,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const senderId = req.user.uid;
      const { chatId } = req.body;

      if (!chatId) {
        return res.status(400).json({ message: "Thiếu chatId" });
      }

      const type = "image"; // ✅ FIX

      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            resource_type: "image",
            folder: "instagram_flutter/chat",
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        ).end(req.file.buffer);
      });

      const timestamp = new Date();

      const messageData = {
        chatId,
        senderId,
        text: "",
        type,
        mediaUrl: result.secure_url,
        status: "sent",
        createdAt: timestamp,
      };

      const messageRef = await db.collection("messages").add(messageData);

      await db.collection("chats").doc(chatId).update({
        lastMessage: "[image]",
        updatedAt: timestamp,
      });

      res.status(201).json({
        id: messageRef.id,
        ...messageData,
        createdAt: timestamp.toISOString(),
      });

    } catch (error) {
      console.error(error); // 👈 nên có
      res.status(500).json({ error: error.message });
    }
  }
);



// GET /api/messages/:chatId - Lấy lịch sử tin nhắn
router.get('/:chatId', verifyToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.uid;

    // Bảo mật: Kiểm tra xem user có trong nhóm chat này không
    const chatDoc = await db.collection('chats').doc(chatId).get();
    if (!chatDoc.exists || !chatDoc.data().members.includes(userId)) {
      return res.status(403).json({ message: "Bạn không có quyền xem cuộc trò chuyện này" });
    }

    const snapshot = await db.collection('messages')
      .where('chatId', '==', chatId)
      .orderBy('createdAt', 'asc')
      .get();

    const messages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt ? doc.data().createdAt.toDate().toISOString() : null
    }));

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;