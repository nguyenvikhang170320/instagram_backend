const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { db } = require('../firebase');
const verifyToken = require('../middlewares/token');

// POST /api/messages/send - Gửi tin nhắn
router.post('/send', verifyToken, async (req, res) => {
  try {
    const senderId = req.user.uid;
    const { chatId, text } = req.body;

    if (!chatId || !text) return res.status(400).json({ message: "Thiếu dữ liệu" });

    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    // 1. Thêm tin nhắn vào collection messages
    const messageRef = await db.collection('messages').add({
      chatId,
      senderId,
      text,
      createdAt: timestamp
    });

    // 2. Cập nhật lastMessage ở bảng chats để danh sách chat nhảy lên đầu
    await db.collection('chats').doc(chatId).update({
      lastMessage: text,
      updatedAt: timestamp
    });

    res.status(201).json({ success: true, messageId: messageRef.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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