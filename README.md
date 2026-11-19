# Vapi Webhook Server - Deployment Guide for Render.com

This guide walks you through deploying the Vapi webhook server to Render.com for free.

## Prerequisites

1. A GitHub account
2. A Firebase project with Firestore enabled
3. A Render.com account (free tier available)

---

## Step 1: Push Code to GitHub

1. Create a new repository on GitHub (e.g., `vapi-webhook-server`)
2. Push the `vapi-server` folder contents to the repository:

```bash
cd vapi-server
git init
git add .
git commit -m "Initial commit: Vapi webhook server"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/vapi-webhook-server.git
git push -u origin main
```

---

## Step 2: Create Firebase Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Project Settings** → **Service Accounts**
4. Click **Generate New Private Key**
5. Save the JSON file securely (you'll need its contents)

---

## Step 3: Create Render Web Service

1. Log in to [Render.com](https://dashboard.render.com/)
2. Click **New +** → **Web Service**
3. Connect your GitHub repository
4. Configure the service:
   - **Name**: `vapi-webhook-server` (or your preferred name)
   - **Region**: Choose closest to your users
   - **Branch**: `main`
   - **Root Directory**: `vapi-server` (if repo contains other folders) or leave blank
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free` (select Free tier)

---

## Step 4: Add Environment Variables

**CRITICAL**: Add these environment variables in Render:

1. Go to your web service → **Environment** tab
2. Click **Add Environment Variable**
3. Add the following:

| Key | Value |
|-----|-------|
| `FIREBASE_SERVICE_ACCOUNT` | **Paste the ENTIRE JSON content** from your Firebase service account key file |

⚠️ **Important**: Copy the ENTIRE JSON (including `{` and `}`) as a single line value. Render will handle the escaping.

Optional environment variables:
| Key | Value | Required |
|-----|-------|----------|
| `PORT` | `3000` | No (Render sets automatically) |

---

## Step 5: Deploy

1. Click **Create Web Service**
2. Wait for build and deploy (usually 2-3 minutes)
3. Once deployed, note your service URL (e.g., `https://vapi-webhook-server.onrender.com`)

---

## Step 6: Configure Vapi

1. Go to your [Vapi Dashboard](https://dashboard.vapi.ai/)
2. Go to your Assistant → **Tools** → **Function Calling**
2. Add a new function:
   ```json
   {
     "name": "book_appointment",
     "description": "Book an appointment for a customer",
     "parameters": {
       "type": "object",
       "properties": {
         "customerName": { "type": "string", "description": "Full name of the customer" },
         "phoneNumber": { "type": "string", "description": "Phone number with country code" },
         "service": { "type": "string", "description": "Service requested (e.g., Haircut, Facial)" },
         "date": { "type": "string", "description": "Appointment date in YYYY-MM-DD format" },
         "time": { "type": "string", "description": "Appointment time in HH:MM 24-hour format" }
       },
       "required": ["customerName", "phoneNumber", "service", "date", "time"]
     }
   }
   ```
3. Set the **Webhook URL** to: `https://YOUR_RENDER_URL.onrender.com/api/vapi-book`

---

## Step 7: Test the Integration

1. In Vapi, use the **Test Call** feature
2. Ask the assistant to book an appointment
3. Check your Firestore `appointments` collection - a new document should appear with:
   - `createdByAI: true`
   - `status: "Pending"`
   - All the booking details

---

## Local Development

```bash
cd vapi-server
npm install
# Set FIREBASE_SERVICE_ACCOUNT env var locally (or use Application Default Credentials)
npm start
```

Server runs at `http://localhost:3000`

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Build fails | Check Node version (requires 18+) |
| Firebase init fails | Verify `FIREBASE_SERVICE_ACCOUNT` JSON is valid |
| Webhook returns 500 | Check Render logs for Firestore permission errors |
| Vapi gets timeout | Ensure function returns within 10s (current impl is fast) |

---

## Security Notes

- The `FIREBASE_SERVICE_ACCOUNT` key has admin access - keep it secret!
- Render encrypts environment variables at rest
- Consider adding API key validation for production use

---

## Cost

- **Render Free Tier**: 750 hours/month (enough for 24/7)
- **Firebase**: Free tier (Spark plan) includes 50K reads, 20K writes/day

---

## Files in This Folder

```
vapi-server/
├── index.js          # Express server with /api/vapi-book endpoint
├── package.json      # Dependencies
└── README.md         # This file
```