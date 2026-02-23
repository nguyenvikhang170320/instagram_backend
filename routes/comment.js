const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");

const db = admin.firestore();


// ============================
// ADD COMMENT
// ============================
router.post("/", async (req, res) => {
  try {
    const { postId, userId, commentText } = req.body;

    if (!postId || !userId || !commentText) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const postRef = db.collection("posts").doc(postId);
    const commentRef = postRef.collection("comments").doc();

    await db.runTransaction(async (transaction) => {
      const postDoc = await transaction.get(postRef);

      if (!postDoc.exists) {
        throw new Error("Post not found");
      }

      transaction.set(commentRef, {
        commentId: commentRef.id,
        userId,
        commentText,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      transaction.update(postRef, {
        commentCount: admin.firestore.FieldValue.increment(1),
      });
    });

    res.status(201).json({ success: true });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// ============================
// DELETE COMMENT
// ============================
router.delete("/:postId/:commentId", async (req, res) => {
  try {
    const { postId, commentId } = req.params;

    const postRef = db.collection("posts").doc(postId);
    const commentRef = postRef.collection("comments").doc(commentId);

    await db.runTransaction(async (transaction) => {
      transaction.delete(commentRef);

      transaction.update(postRef, {
        commentCount: admin.firestore.FieldValue.increment(-1),
      });
    });

    res.status(200).json({ success: true });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// ============================
// GET COMMENTS LIST
// ============================
router.get("/:postId", async (req, res) => {
  try {
    const { postId } = req.params;

    const snapshot = await db
      .collection("posts")
      .doc(postId)
      .collection("comments")
      .orderBy("createdAt", "desc")
      .limit(30)
      .get();

    const comments = snapshot.docs.map(doc => ({
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate()?.toISOString()
    }));

    res.json(comments);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;