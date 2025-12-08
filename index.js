const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const uri =process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server
    // await client.connect(); // Uncomment in production if needed
    
    const db = client.db('TicketBariDB');
    const usersCollection = db.collection('users');
    const ticketsCollection = db.collection('tickets');
    const bookingsCollection = db.collection('bookings');

    // --- JWT Middleware ---
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' });
        }
        req.decoded = decoded;
        next();
      });
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

    // --- Auth Related API ---
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    });

    // --- User API (Save user to DB) ---
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
    
    // Get user role
    app.get('/users/role/:email', verifyToken, async (req, res) => {
        const email = req.params.email;
        if (email !== req.decoded.email) {
            return res.status(403).send({ message: 'unauthorized access' })
        }
        const query = { email: email };
        const user = await usersCollection.findOne(query);
        let role = 'user';
        if (user) {
            role = user?.role; // 'admin', 'vendor', 'user'
        }
        res.send({ role });
    })

    // Get All Users (Admin Only)
    app.get('/users', verifyToken, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // Make Admin API
    app.patch('/users/admin/:id', verifyToken, async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
            $set: { role: 'admin' }
        };
        const result = await usersCollection.updateOne(filter, updatedDoc);
        res.send(result);
    })
    // --- ADMIN: Approve/Reject Ticket ---
    app.patch('/tickets/status/:id', verifyToken, verifyAdmin, async (req, res) => {
        const id = req.params.id;
        const { status } = req.body; // { status: 'approved' } or 'rejected'
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
            $set: { verificationStatus: status }
        };
        const result = await ticketsCollection.updateOne(filter, updatedDoc);
        res.send(result);
    });

    // --- VENDOR: Accept/Reject Booking ---
    app.patch('/bookings/status/:id', verifyToken, async (req, res) => {
        const id = req.params.id;
        const { status } = req.body; // { status: 'approved' } or 'rejected'
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

    // --- Get Tickets by Vendor Email (For My Added Tickets page) ---
    app.get('/tickets/vendor/:email', verifyToken, async (req, res) => {
        const email = req.params.email;
        const query = { vendorEmail: email };
        const result = await ticketsCollection.find(query).toArray();
        res.send(result);
    });

    // --- Delete a Ticket ---
    app.delete('/tickets/:id', verifyToken, async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await ticketsCollection.deleteOne(query);
        res.send(result);
    });


    // --- Ticket APIs ---
    app.get('/tickets', async (req, res) => {
      // Implement filtering, searching, sorting here
      const result = await ticketsCollection.find().toArray();
      res.send(result);
    });

    app.post('/tickets', verifyToken, async (req, res) => {
        const item = req.body;
        const result = await ticketsCollection.insertOne(item);
        res.send(result);
    });
    

    // --- Get Single Ticket (For Details Page) ---
    app.get('/tickets/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await ticketsCollection.findOne(query);
      res.send(result);
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
    
    // 3. Delete/Cancel a Booking
    app.delete('/bookings/:id', verifyToken, async(req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await bookingsCollection.deleteOne(query);
        res.send(result);
    })

    // --- Payment Intent (Stripe) ---
    app.post('/create-payment-intent', verifyToken, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100); // Stripe works in cents
      
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });

      res.send({
        clientSecret: paymentIntent.client_secret
      });
    });
    // --- Save Payment Info ---
    app.post('/payments', verifyToken, async (req, res) => {
      const payment = req.body;
      const insertResult = await bookingsCollection.insertOne(payment); // NOTE: Changed db.collection to bookingsCollection or create a new paymentsCollection

      // You likely want a separate collection for payments, so let's use the DB instance:
      const paymentResult = await db.collection('payments').insertOne(payment);

      // Also update the booking status to 'paid'
      const query = { _id: new ObjectId(payment.bookingId) };
      const updatedDoc = {
        $set: { status: 'paid' }
      }
      const updateResult = await bookingsCollection.updateOne(query, updatedDoc);

      res.send(paymentResult);
    });

    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('TicketBari Server is running');
});

app.listen(port, () => {
  console.log(`TicketBari is running on port ${port}`);
});