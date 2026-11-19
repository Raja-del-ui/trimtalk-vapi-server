/**
 * Vapi Webhook Server for TrimTalk AI
 * Handles appointment booking callbacks from Vapi voice agent
 */

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin
let db = null;
function initializeFirebase() {
  if (admin.apps.length > 0) {
    admin.app();
  } else {
    // Check for service account in environment variable
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountJson) {
      try {
        const serviceAccount = JSON.parse(serviceAccountJson);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      } catch (e) {
        console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', e);
        process.exit(1);
      }
    } else {
      // Try to use Application Default Credentials (for local dev or Cloud Run)
      try {
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
        });
      } catch (e) {
        console.error('Failed to initialize Firebase Admin:', e);
        process.exit(1);
      }
    }
  }
  db = admin.firestore();
}

// Initialize Firebase on startup
initializeFirebase();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Vapi webhook endpoint for appointment booking
app.post('/api/vapi-book', async (req, res) => {
  try {
    // Extract data from Vapi webhook
    const { customerName, phoneNumber, service, date, time } = req.body;

    // Validate required fields
    if (!customerName || !phoneNumber || !service || !date || !time) {
      return res.status(400).json({
        error: 'Missing required fields: customerName, phoneNumber, service, date, time'
      });
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        error: 'Invalid date format. Expected YYYY-MM-DD'
      });
    }

    // Validate time format (HH:MM)
    if (!/^\d{2}:\d{2}$/.test(time)) {
      return res.status(400).json({
        error: 'Invalid time format. Expected HH:MM'
      });
    }

    // Create appointment document
    const appointmentData = {
      customerName: customerName.trim(),
      phoneNumber: phoneNumber.trim(),
      service: service.trim(),
      date: date,
      time: time,
      status: 'Pending',
      createdByAI: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Write to Firestore
    const docRef = await db.collection('appointments').add(appointmentData);
    console.log('Appointment created:', docRef.id, appointmentData);

    // Return simple success response for Vapi
    res.status(200).json({
      result: 'Appointment booked successfully!'
    });

  } catch (error) {
    console.error('Error booking appointment:', error);
    res.status(500).json({
      result: 'Failed to book appointment. Please try again.'
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Vapi webhook server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Vapi webhook: http://localhost:${PORT}/api/vapi-book`);
});

module.exports = app;