const express = require("express");
const { db } = require("../firebase"); // Import Firestore từ firebase.js

const router = express.Router();
router.get("/debug/posts", async (req, res) => {
    try {
        const postsSnapshot = await db.collection("posts").get();
        let posts = [];
        postsSnapshot.forEach(doc => {
            console.log(`✅ Post found: ${JSON.stringify(doc.data(), null, 2)}`);
            posts.push({ id: doc.id, ...doc.data() });
        });
        res.status(200).json({ posts });
    } catch (error) {
        console.error("❌ Lỗi khi debug posts:", error);
        res.status(500).json({ error: "Lỗi server" });
    }
});
module.exports = router;