const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const admin = require("firebase-admin");
const Razorpay = require("razorpay");
const cors = require("cors");

const app = express();
app.use(cors());

// Capture raw body for webhook verification
app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// ================= FIREBASE INITIALIZATION =================
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();

// ================= RAZORPAY INITIALIZATION =================
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

// ============================================================
// CREATE SUBSCRIPTION ROUTE
// ============================================================
app.post("/create-subscription", async (req, res) => {
  try {
    const { userId, planId } = req.body;

    if (!userId || !planId) {
      return res.status(400).json({ error: "Missing userId or planId" });
    }

    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      customer_notify: 1,
      total_count: 12,
      notes: {
        userId: userId
      }
    });

    res.json({
      subscriptionId: subscription.id,
      razorpayKey: process.env.RAZORPAY_KEY_ID
    });

  } catch (error) {
    console.error("Subscription creation error:", error);
    res.status(500).json({ error: "Subscription creation failed" });
  }
});

// ============================================================
// UPDATED RAZORPAY WEBHOOK ROUTE
// ============================================================
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
    let userId = null;

    // Handle subscription activation
    if (event === "subscription.activated") {
      const subscription = req.body.payload.subscription.entity;
      userId = subscription?.notes?.userId;
    }

    // Handle payment captured event
    if (event === "payment.captured") {
      const payment = req.body.payload.payment.entity;
      userId = payment?.notes?.userId;
    }

    if (!userId) {
      console.log("Webhook received but no userId found.");
      return res.status(200).send("No user linked");
    }

    await db.ref(`users/${userId}`).update({
      subscription: "premium"
    });

    console.log("User upgraded to premium:", userId);

    res.status(200).send("OK");

  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).send("Server error");
  }
});

// ============================================================
// HEALTH CHECK ROUTE
// ============================================================
app.get("/", (req, res) => {
  res.send("ChatBud Backend Running");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
