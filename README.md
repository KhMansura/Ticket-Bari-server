# 🚍 TicketBari Server

The backend API service for **TicketBari** - a comprehensive Online Ticket Booking Platform. This server handles authentication, payment processing, data management, and secure admin verification.

🔗 **Live API URL:** [https://ticket-bari-server-deploy-link.vercel.app](https://ticket-bari-server-deploy-link.vercel.app)  
📂 **Client Repository:** [Link to Client Repo](https://github.com/KhMansura/Ticket-Bari-client.git)

---

## 🚀 Features

* **RESTful API Architecture:** Organized endpoints for Users, Tickets, Bookings, and Payments.
* **Secure Authentication:**
    * **Firebase Admin SDK:** Middleware to verify tokens securely on the server side.
    * **JWT Fallback:** (If applicable) Secure token management.
* **Role-Based Security:** Middleware (`verifyAdmin`, `verifyToken`) to protect sensitive routes.
* **Payment Integration:** **Stripe** backend logic to create payment intents and calculate totals securely.
* **Database Management:** **MongoDB** Native Driver implementation for efficient CRUD operations.
* **Advanced Filtering:** Search, Sort, and Filter logic for the "All Tickets" page.

---

## 🛠️ Technologies Used

* **Runtime:** Node.js
* **Framework:** Express.js
* **Database:** MongoDB
* **Authentication:** Firebase Admin SDK
* **Payments:** Stripe
* **Environment:** Dotenv

---

## 📦 NPM Packages
* `express`: Web framework for Node.js.
* `cors`: Middleware to enable Cross-Origin Resource Sharing.
* `dotenv`: Loads environment variables from a `.env` file.
* `mongodb`: The official MongoDB driver for Node.js.
* `firebase-admin`: Server-side Firebase authentication and management.
* `stripe`: Official Stripe library for payment processing.

---

## ⚙️ Environment Variables (.env)

To run this project locally, create a `.env` file in the root directory and add the following keys:

```env
# Database Configuration
DB_USER=your_mongodb_username
DB_PASS=your_mongodb_password

# JWT / Token Secrets (If used)
ACCESS_TOKEN_SECRET=your_random_secret_token

# Stripe Configuration
STRIPE_SECRET_KEY=your_stripe_secret_key

# Note: The 'serviceAccountKey.json' file for Firebase Admin must be placed in the root directory (but ignored by Git).