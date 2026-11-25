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

// Helper: Convert HH:MM to minutes since midnight
function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

// Helper: Convert minutes to HH:MM format
function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

// Helper: Check if two time ranges overlap
function hasOverlap(start1, end1, start2, end2) {
  return start1 < end2 && end1 > start2;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Vapi webhook endpoint for appointment booking
app.post('/api/vapi-book', async (req, res) => {
  try {
    // Extract data from Vapi webhook
    const { customerName, phoneNumber, service, date, time, staffId } = req.body;

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

    // 1. Fetch the real service duration from Firestore
    let duration = 30; // default fallback
    try {
      const servicesSnap = await db.collection('services')
        .where('name', '==', service.trim())
        .limit(1)
        .get();
      
      if (!servicesSnap.empty) {
        const serviceDoc = servicesSnap.docs[0].data();
        if (serviceDoc.duration && typeof serviceDoc.duration === 'number') {
          duration = serviceDoc.duration;
        } else if (serviceDoc.duration && typeof serviceDoc.duration === 'string') {
          // Handle "30 min" format
          const parsed = parseInt(serviceDoc.duration.replace(/\D/g, ''), 10);
          if (!isNaN(parsed)) duration = parsed;
        }
      }
    } catch (e) {
      console.warn('Could not fetch service duration, using default 30:', e);
    }

    // 2. Calculate end time
    const startMinutes = timeToMinutes(time);
    const endMinutes = startMinutes + duration;
    const endTime = minutesToTime(endMinutes);

    // 3. Check for conflicts with existing appointments
    // We need staffId to check conflicts for the specific staff member
    // If staffId not provided, check all appointments for that date/time
    let conflictQuery = db.collection('appointments')
      .where('date', '==', date)
      .where('status', 'in', ['Pending', 'Confirmed', 'Completed']);
    
    if (staffId) {
      conflictQuery = conflictQuery.where('staffId', '==', staffId);
    }

    const existingAppointmentsSnap = await conflictQuery.get();
    
    let hasConflict = false;
    let conflictingAppointment = null;

    for (const doc of existingAppointmentsSnap.docs) {
      const existing = doc.data();
      const existingStart = timeToMinutes(existing.time);
      const existingDuration = existing.duration || 30;
      const existingEnd = existingStart + existingDuration;

      if (hasOverlap(startMinutes, endMinutes, existingStart, existingEnd)) {
        hasConflict = true;
        conflictingAppointment = existing;
        break;
      }
    }

    if (hasConflict) {
      console.log('Conflict detected:', conflictingAppointment);
      return res.status(200).json({
        result: 'Error: This time slot is already booked for the requested duration. Please ask the customer for another time.'
      });
    }

    // 4. No conflict - save the appointment
    const appointmentData = {
      customerName: customerName.trim(),
      phoneNumber: phoneNumber.trim(),
      service: service.trim(),
      date: date,
      time: time,
      endTime: endTime,
      duration: duration,
      status: 'Pending',
      createdByAI: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Add staffId if provided
    if (staffId) {
      appointmentData.staffId = staffId;
    }

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