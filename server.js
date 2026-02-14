const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const admin = require("firebase-admin");
const cors = require("cors");

const app = express();
app.use(cors());

app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// Load Firebase service account from environment variable
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();

const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

app.post("/razorpay-webhook", async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];

    const expectedSignature = crypto
      .createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
      .update(req.rawBody)
      .digest("hex");

    if (signature !== expectedSignature) {
      return res.status(400).send("Invalid signature");
    }

    const event = req.body.event;

    if (event === "subscription.activated") {
      const subscription = req.body.payload.subscription.entity;
      const userId = subscription.notes.userId;

      if (!userId) {
        return res.status(400).send("User ID missing");
      }

      await db.ref(`users/${userId}`).update({
        subscription: "premium"
      });

      console.log("User upgraded:", userId);
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).send("Server error");
  }
});

app.get("/", (req, res) => {
  res.send("ChatBud Backend Running");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
