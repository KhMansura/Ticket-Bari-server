const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const admin = require("firebase-admin");
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// Initialize Firebase Admin
// const serviceAccount = require("./serviceAccountKey.json");

// const serviceAccount = require("./firebase-admin-key.json");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const privateKey = process.env.FIREBASE_PRIVATE_KEY 
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
    : undefined;

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey,
        }),
    });
}

// Middleware
// app.use(cors());
app.use(cors({
  origin: [
    'http://localhost:5173', 
    'https://ticket-bari-89e64.web.app',
    'https://ticket-bari-89e64.firebaseapp.com'
  ],
  credentials: true
}));
app.use(express.json());

// MongoDB Connection
//  const uri = process.env.MONGODB_URI;
// const uri = "mongodb+srv://tiketBari:7EqBz4gBPfCgLdE1@cluster0.hytrggc.mongodb.net/?appName=Cluster0";
//const uri= "mongodb://ticketadmin:Wg18oaS1nhPtDlBA@cluster0.hytrggc.mongodb.net/?appName=Cluster0&retryWrites=true&w=majority";
// const uri= "mongodb+srv://ticketadmin:CRg8SgXIPf1KLCq5@cluster0.shyhiog.mongodb.net/?appName=Cluster0";

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hytrggc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});


async function run() {
  try {
    // Connect client to server
    await client.connect(); 
    console.log("✅ Successfully connected to MongoDB!");
    
    const db = client.db('TicketBariDB');
    const usersCollection = db.collection('users');
    const ticketsCollection = db.collection('tickets');
    const bookingsCollection = db.collection('bookings');

  
    //  MIDDLEWARE: VERIFY FIREBASE TOKEN
    
    const verifyToken = async (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'forbidden access' });
      }

      const token = req.headers.authorization.split(' ')[1];

      try {
        // Verify token using Firebase Admin
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.decoded = decodedToken;
        next();
      } catch (error) {
        return res.status(401).send({ message: 'unauthorized access' });
      }
    };

    // --- Verify Admin Middleware ---
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    };
    // --- Stop Demo Admin Middleware ---
const stopDemoAdmin = (req, res, next) => {
    const email = req.decoded.email;
    // Check if the user is the demo admin and trying to do anything other than GET
    if (email === 'admin@ticketbari.com' && req.method !== 'GET') {
        return res.status(403).send({ message: 'Demo Admin cannot modify data' });
    }
    next();
};

    // --- User API ---
    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'user already exists', insertedId: null });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });
    // --- USER: Stats Overview API ---
app.get('/user-stats/:email', verifyToken, async (req, res) => {
    const email = req.params.email;

    // 1. Mot koto gulo ticket book koreche
    const totalBookings = await bookingsCollection.countDocuments({ customerEmail: email });

    // 2. Mot koto taka khoroch (Paid amount)
    const paymentData = await db.collection('payments').find({ email: email }).toArray();
    const totalSpent = paymentData.reduce((sum, payment) => sum + payment.price, 0);

    // 3. Status wise booking counts (Pending vs Paid vs Rejected)
    const bookingStats = await bookingsCollection.aggregate([
        { $match: { customerEmail: email } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
    ]).toArray();

    // 4. Monthly Spending Chart Data
    const spendingHistory = paymentData.map(p => ({
        month: new Date(p.date).toLocaleString('default', { month: 'short' }),
        amount: p.price
    }));

    res.send({
        totalBookings,
        totalSpent,
        bookingStats,
        spendingHistory
    });
});
    
    // Get user role
    app.get('/users/role/:email', verifyToken, async (req, res) => {
        const email = req.params.email;
        if (email !== req.decoded.email) {
            return res.status(403).send({ message: 'unauthorized access' })
        }
        const query = { email: { $regex: new RegExp(`^${email}$`, 'i') } };
        const user = await usersCollection.findOne(query);
        let role = 'user';
        if (user) {
            role = user?.role; 
        }
        res.send({ role });
    })

    // Get All Users (Admin Only)
    app.get('/users', verifyToken, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });



    // "Make Admin / Vendor / User" API
app.patch('/users/admin/:id', verifyToken, verifyAdmin,stopDemoAdmin, async (req, res) => {
    const id = req.params.id;
    const { role } = req.body;

    // Safety Check
    if (!role) {
        return res.status(400).send({ message: "Role is required" });
    }

    const filter = { _id: new ObjectId(id) };
    const updatedDoc = {
        $set: { role: role }
    };
    
    const result = await usersCollection.updateOne(filter, updatedDoc);
    res.send(result);
});

    // Mark Vendor as Fraud
    app.patch('/users/fraud/:id', verifyToken,stopDemoAdmin, async (req, res) => {
      const id = req.params.id;
      const user = await usersCollection.findOne({ _id: new ObjectId(id) });
      
      if(!user) {
        return res.status(404).send({ message: "User not found" });
      }

      // 1. Change User Role to 'fraud'
      const userFilter = { _id: new ObjectId(id) };
      const updatedUser = { $set: { role: 'fraud' } };
      const userResult = await usersCollection.updateOne(userFilter, updatedUser);

      // 2. Reject all tickets by this Vendor
      const ticketFilter = { vendorEmail: user.email };
      const updatedTickets = { $set: { verificationStatus: 'rejected', isAdvertised: false } };
      const ticketResult = await ticketsCollection.updateMany(ticketFilter, updatedTickets);

      res.send({ 
        userModified: userResult.modifiedCount, 
        ticketsModified: ticketResult.modifiedCount 
      });
    });

    // --- ADMIN: Stats Overview API ---
app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
    const totalUsers = await usersCollection.countDocuments();
    const totalTickets = await ticketsCollection.countDocuments();
    
    // Calculate Approved/Pending/Rejected Tickets
    const ticketStats = await ticketsCollection.aggregate([
        {
            $group: {
                _id: '$verificationStatus',
                count: { $sum: 1 }
            }
        }
    ]).toArray();

    // Calculate Role Distribution
    const roleStats = await usersCollection.aggregate([
        {
            $group: {
                _id: '$role',
                count: { $sum: 1 }
            }
        }
    ]).toArray();

    // Advertisement Data
    const advertisedCount = await ticketsCollection.countDocuments({ isAdvertised: true });

    res.send({
        totalUsers,
        totalTickets,
        ticketStats,
        roleStats,
        advertisedCount,
        advertisementLimit: 6 
    });
});

    // --- ADMIN: Approve/Reject Ticket ---
    app.patch('/tickets/status/:id', verifyToken, verifyAdmin,stopDemoAdmin, async (req, res) => {
        const id = req.params.id;
        const { status } = req.body; 
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
            $set: { verificationStatus: status }
        };
        const result = await ticketsCollection.updateOne(filter, updatedDoc);
        res.send(result);
    });

    // --- ADMIN: Toggle Advertisement ---
    app.patch('/tickets/advertise/:id', verifyToken, verifyAdmin, stopDemoAdmin, async (req, res) => {
        const id = req.params.id;
        const { isAdvertised } = req.body; 
        
        if (isAdvertised) {
            const count = await ticketsCollection.countDocuments({ isAdvertised: true });
            if (count >= 6) {
                return res.send({ message: 'limit_reached' });
            }
        }

        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
            $set: { isAdvertised: isAdvertised }
        };
        const result = await ticketsCollection.updateOne(filter, updatedDoc);
        res.send(result);
    });

    // --- PUBLIC: Get Advertised Tickets ---
    app.get('/tickets/advertised', async (req, res) => {
        const result = await ticketsCollection.find({ isAdvertised: true }).limit(6).toArray();
        res.send(result);
    });

    // --- VENDOR: Accept/Reject Booking ---
    app.patch('/bookings/status/:id', verifyToken,stopDemoAdmin, async (req, res) => {
        const id = req.params.id;
        const { status } = req.body; 
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
            $set: { status: status }
        };
        const result = await bookingsCollection.updateOne(filter, updatedDoc);
        res.send(result);
    });
    
    // --- VENDOR: Get Bookings for THEIR tickets ---
    app.get('/bookings/vendor', verifyToken, async (req, res) => {
        const email = req.query.email;
        const query = { vendorEmail: email };
        const result = await bookingsCollection.find(query).toArray();
        res.send(result);
    });

    // --- Get Tickets by Vendor Email  ---
    app.get('/tickets/vendor/:email', verifyToken, async (req, res) => {
        const email = req.params.email;
        const query = { vendorEmail: email };
        const result = await ticketsCollection.find(query).toArray();
        res.send(result);
    });

    // --- VENDOR: Get Stats ---
    app.get('/vendor-stats/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const tickets = await ticketsCollection.find({ vendorEmail: email }).toArray();
      const bookings = await bookingsCollection.find({ vendorEmail: email }).toArray();
      
      const totalTickets = tickets.length;
      const totalBookings = bookings.length;
      
      // Calculate Revenue
      const totalRevenue = bookings.reduce((sum, booking) => {
        return booking.status === 'paid' ? sum + booking.totalPrice : sum;
      }, 0);

      // Chart Data
      const chartData = bookings.reduce((acc, booking) => {
         if (booking.status === 'paid') {
             const existing = acc.find(item => item.name === booking.ticketTitle);
             if (existing) {
                 existing.value += booking.totalPrice;
             } else {
                 acc.push({ name: booking.ticketTitle, value: booking.totalPrice });
             }
         }
         return acc;
      }, []);

      res.send({ totalTickets, totalBookings, totalRevenue, chartData });
    });

    // --- Delete a Ticket ---
    app.delete('/tickets/:id', verifyToken,stopDemoAdmin, async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await ticketsCollection.deleteOne(query);
        res.send(result);
    });


    // --- Ticket APIs ---
    app.get('/tickets', async (req, res) => {
      const result = await ticketsCollection.find().toArray();
      res.send(result);
    });

    app.post('/tickets', verifyToken,stopDemoAdmin, async (req, res) => {
        const item = req.body;
        const result = await ticketsCollection.insertOne(item);
        res.send(result);
    });

    // Update a Ticket
    app.patch('/tickets/:id', verifyToken,stopDemoAdmin, async (req, res) => {
      const id = req.params.id;
      const updatedTicket = req.body;
      const filter = { _id: new ObjectId(id) };
      
      const updateDoc = {
        $set: {
          title: updatedTicket.title,
          from: updatedTicket.from,
          to: updatedTicket.to,
          transportType: updatedTicket.transportType,
          price: updatedTicket.price,
          quantity: updatedTicket.quantity,
          departureDate: updatedTicket.departureDate,
          perks: updatedTicket.perks,
          photo: updatedTicket.photo
        }
      };

      const result = await ticketsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    
    // --- Get Single Ticket ---
    app.get('/tickets/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await ticketsCollection.findOne(query);
      res.send(result);
    });
    // --- Get Taken Seats for a Ticket ---
    app.get('/tickets/taken-seats/:id', async (req, res) => {
        const id = req.params.id;
        // Find all bookings for this ticket that are NOT rejected
        const query = { ticketId: id, status: { $ne: 'rejected' } };
        const bookings = await bookingsCollection.find(query).toArray();
        
        // Combine all seat numbers into one array
        let takenSeats = [];
        bookings.forEach(booking => {
            if (booking.seatNumbers && Array.isArray(booking.seatNumbers)) {
                takenSeats = [...takenSeats, ...booking.seatNumbers];
            }
        });
        
        res.send(takenSeats);
    });

    // --- Booking APIs ---
    // 1. Save a Booking
    app.post('/bookings', verifyToken, async (req, res) => {
      const booking = req.body;
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    // 2. Get Bookings for a Specific User
    app.get('/bookings', verifyToken, async (req, res) => {
      const email = req.query.email;
      if (!email) return res.send([]);
      const query = { customerEmail: email };
      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
    });
  
    // 3. Delete/Cancel a Booking (Only if status is 'pending')
    app.delete('/bookings/:id', verifyToken, async(req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        
        // 1. Find the booking first
        const booking = await bookingsCollection.findOne(query);

        // 2. Check status
        if (!booking) {
            return res.status(404).send({ message: "Booking not found" });
        }
        
        //  Only allow cancel if status is 'pending'
        if (booking.status !== 'pending') {
            return res.status(403).send({ message: "Cannot cancel. Vendor has already accepted or it is paid." });
        }

        // 3. Delete if safe
        const result = await bookingsCollection.deleteOne(query);
        res.send(result);
    })

    // --- Payment - Stripe ---
    app.post('/create-payment-intent', verifyToken, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100); 
      
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });

      res.send({
        clientSecret: paymentIntent.client_secret
      });
    });

    // --- Get Payments by Email ---
    app.get('/payments/:email', verifyToken, async (req, res) => {
        const query = { email: req.params.email };
        const result = await db.collection('payments').find(query).toArray();
        res.send(result);
    });

    // --- Save Payment Info & Update Quantity ---
    app.post('/payments', verifyToken, async (req, res) => {
      const payment = req.body;
      
      const insertResult = await db.collection('payments').insertOne(payment);

      const bookingQuery = { _id: new ObjectId(payment.bookingId) };
      const updatedBooking = { $set: { status: 'paid' } };
      await bookingsCollection.updateOne(bookingQuery, updatedBooking);

      const booking = await bookingsCollection.findOne(bookingQuery);
      
      if(booking){
          const ticketQuery = { _id: new ObjectId(booking.ticketId) };
          const updateTicket = { $inc: { quantity: -booking.bookingQty } }; 
          await ticketsCollection.updateOne(ticketQuery, updateTicket);
      }

      res.send(insertResult);
    });

    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('TicketBari Server is running');
});

app.listen(port, () => {
  console.log(`TicketBari is running on port ${port}`);
});
