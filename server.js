const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const app = express();
const port = 3000;

app.use(cors());
app.use(express.static('public'));  // Serve static files like HTML

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // Replace '*' with specific origin if needed
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// MongoDB connection URL
const url = 'mongodb://localhost:27017';
const dbName = 'Trains';
let db, trainsCollection;

// Connect to MongoDB
MongoClient.connect(url, { useUnifiedTopology: true })
  .then(client => {
    console.log('MongoDB connected');
    db = client.db(dbName);
    trainsCollection = db.collection('Trains');
  })
  .catch(err => {
    console.error('Error connecting to MongoDB:', err);
    process.exit(1);  // Exit the process if MongoDB connection fails
  });

// API endpoint to fetch filtered trains
app.get('/api/trains', async (req, res) => {
  const { fromCity, toCity, date } = req.query;

  // Log incoming query parameters
  console.log('Received query:', { fromCity, toCity, date });

  try {
    // Build the query based on the provided parameters
    const query = {};
    if (fromCity) query.fromCity = { $regex: new RegExp(fromCity.trim(), 'i') };
    if (toCity) query.toCity = { $regex: new RegExp(toCity.trim(), 'i') };
    if (date) query.date = date.trim();  // Exact match for date

    // Fetch trains from the collection based on the query
    const trains = await trainsCollection.find(query).toArray();

    // Log the fetched trains
    console.log('Fetched trains:', trains);

    if (!trains || trains.length === 0) {
      console.log('No trains found for the selected route');
      return res.json({ message: 'No trains found for the selected route' });
    }

    // Extract only the required fields: trainNumber and totalSeats
    const result = trains.map(train => ({
      trainNumber: train.trainNumber,
      totalSeats: train.seat1AC + train.seat2AC + train.seat3AC + train.seat2S + train.seatEV,
    }));

    console.log('Mapped result:', result);

    return res.json(result);

  } catch (err) {
    console.error('Error fetching trains:', err);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.get('/api/train/:trainNumber', async (req, res) => {
  const trainNumber = req.params.trainNumber;

  console.log(`Fetching details for train number: ${trainNumber}`); // Debug log

  try {
    const trainDetails = await trainsCollection.findOne({ trainNumber: trainNumber });

    if (!trainDetails) {
      console.log(`Train with number ${trainNumber} not found`); // Debug log
      return res.status(404).json({ message: 'Train not found' });
    }

    console.log('Train details fetched:', trainDetails); // Debug log

    return res.json(trainDetails);
  } catch (error) {
    console.error('Error fetching train details:', error); // Debug log
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.use(express.json());

app.post('/api/bookings', async (req, res) => {
  try {
    console.log('POST /api/bookings called'); // Debug log
    console.log('Request body:', req.body);  // Debug log
    
    // Ensure the MongoDB connection is established
    const client = new MongoClient(url, { useUnifiedTopology: true });
    await client.connect();
    console.log('MongoDB connected for /api/bookings'); // Debug log
    
    const db = client.db(dbName);
    const bookingsCollection = db.collection('BookingHistory');
    
    // Validate incoming booking details
    const bookingDetails = req.body;
    if (!bookingDetails || !bookingDetails.email || !bookingDetails.date || !bookingDetails.trainNumber) {
      console.error('Invalid booking details:', bookingDetails);
      return res.status(400).json({ success: false, message: 'Invalid booking details' });
    }
    
    console.log('Booking details validated:', bookingDetails); // Debug log
    
    // Insert the new booking
    const result = await bookingsCollection.insertOne(bookingDetails);
    console.log('Insert result:', result); // Debug log
    
    if (result.acknowledged) {
      console.log('Booking insertion successful');
      res.json({ success: true });
    } else {
      console.error('Booking insertion failed');
      res.json({ success: false, message: 'Booking insertion failed' });
    }
  } catch (error) {
    console.error('Error during booking:', error); // Debug log
    res.status(500).json({ success: false, message: 'Error processing booking' });
  }
});

app.get('/api/bookingHistory', async (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    const bookings = await db.collection('BookingHistory').find({ email }).toArray();

    if (bookings.length === 0) {
      return res.json([]);
    }

    res.json(bookings);
  } catch (err) {
    console.error('Error fetching booking history:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.get('/api/profile', async (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    const collection = db.collection('Profiles');
    let profile = await collection.findOne({ email });

    if (!profile) {
      // Create a new profile if none is found
      profile = {
        email,
        name: 'Default Name', // Set a default name or an empty string
        'phone number': '0000000000', // Set a default phone number or an empty string
      };
      const insertResult = await collection.insertOne(profile);
      if (!insertResult.acknowledged) {
        throw new Error('Failed to create a new profile');
      }
    }

    res.json(profile);
  } catch (err) {
    console.error('Error fetching or creating profile:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});


app.put('/api/profiles', async (req, res) => {
  const { email, name, 'phone number': phoneNumber } = req.body;

  if (!email || !name || !phoneNumber) {
    return res.status(400).json({ message: 'Invalid profile data' });
  }

  try {
    const result = await db.collection('Profiles').updateOne(
      { email },
      { $set: { name, 'phone number': phoneNumber } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating profile:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});


// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
