import express from 'express';
import connectDB from './db.js';
import passport from './config/passport.js';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import dotenv from 'dotenv';
import cors from 'cors';
import methodOverride from 'method-override';
import path from 'path';
import axios from 'axios';
import User from './models/User.js';
import City from './models/City.js';
import Chat from './models/Chat.js';
import sgMail from '@sendgrid/mail';
import Twilio from 'twilio';

dotenv.config(); // Load environment variable

const app = express();

// ✅ Connect to Database
connectDB();

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cors());
app.use(methodOverride('_method'));
app.use(express.static('public'));

app.use(session({
    secret: process.env.SESSION_SECRET || 'super-secret-key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI, // ✅ Uses the correct connection string
        collectionName: 'sessions'
    }),
    cookie: { secure: false } // Set to true if using HTTPS
}));

app.use(passport.initialize());
app.use(passport.session());

app.post('/login', passport.authenticate('local'), (req, res) => {
    res.json({ message: "✅ Login successful!" });
});

app.get('/api/weather', async (req, res) => {
    try {
        const city = req.query.city;
        if (!city) return res.status(400).json({ error: "City is required" });

        if (!process.env.OPENWEATHER_API_KEY) {
            return res.status(500).json({ error: "API key is missing" });
        }

        const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`;
        const response = await axios.get(url);
        res.json(response.data);
    } catch (error) {
        console.error("❌ Weather API Error:", error);
        res.status(500).json({ error: "Failed to fetch weather data" });
    }
});

const PORT = process.env.PORT || 3000;  // ✅ Keep only one declaration

const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

// ✅ Handle "EADDRINUSE" error to prevent crashes
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Trying a different port...`);
        setTimeout(() => {
            server.listen(0, () => { // 0 means pick a random available port
                console.log(`🚀 Server restarted on available port: ${server.address().port}`);
            });
        }, 1000);
    } else {
        console.error('❌ Server error:', err);
    }
});

// Keep the server alive
setInterval(() => {
    console.log("✅ Keeping the server alive...");
}, 1000 * 60 * 5); // Runs every 5 minutes

// API route to send API key to frontend
app.get("/api/getApiKey", (req, res) => {
   res.json({ apiKey: process.env.OPENWEATHER_API_KEY || "" });
});

// Twilio configuration
const twilioClient = new Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Debugging: Print MONGO_URI to logs
console.log("🔍 Checking MONGO_URI:", process.env.MONGO_URI);

const mongoURI = process.env.MONGO_URI;
if (!mongoURI) {
    console.warn("⚠️ Warning: MONGO_URI is missing. Using local fallback.");
}

// Middleware
app.use(express.json({ limit: "10mb" })); // Increase limit if needed
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cors());
app.use(methodOverride('_method'));
app.use(express.static('public'));

// Disable favicon request
app.get('/favicon.ico', (req, res) => res.status(204));

// Explicitly serve videos with correct MIME type
app.get('/public/videos/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'videos', req.params.filename);
  res.setHeader('Content-Type', 'video/mp4');
  res.sendFile(filePath);
});

// Routes
app.post('/register', async (req, res) => {
    try {
        console.log("Request Body:", req.body);
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: "Missing fields" });
        res.status(201).json({ message: "User registered successfully" });
    } catch (error) {
        console.error("Registration Error:", error);
        res.status(500).json({ error: "Server error" });
    }
});

app.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });

        if (!user || !user.comparePassword(password)) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        res.json({ message: "Login successful", user });
    } catch (error) {
        console.error("❌ Login error:", error);
        res.status(500).json({ error: "Server error" });
    }
});

// Secure Route: Save City (Only if logged in)
app.post('/cities', async (req, res) => {
    try {
        if (!req.isAuthenticated() || !req.user) {
            return res.status(401).json({ error: "You must be logged in" });
        }

        const { city } = req.body;
        if (!city) return res.status(400).json({ error: "City name required" });

        // Check if city already exists for the user
        const existingCity = await City.findOne({ name: city, userId: req.user.id });
        if (existingCity) {
            return res.status(400).json({ error: "City already saved" });
        }

        // Save city if it doesn't exist
        const newCity = new City({ name: city, userId: req.user.id });
        await newCity.save();
        res.status(201).json({ message: "City saved", city: newCity });
    } catch (error) {
        console.error("Error saving city:", error);
        res.status(500).json({ error: "Error saving city" });
    }
});

// Secure Route: Fetch User's Saved Cities
app.get('/cities', async (req, res) => {
    try {
        if (!req.isAuthenticated() || !req.user) {
            return res.status(401).json({ error: "Not authenticated" });
        }

        const cities = await City.find({ userId: req.user.id });
        res.json(cities);
    } catch (err) {
        console.error("Error fetching cities:", err);
        res.status(500).json({ error: "Server error while fetching cities" });
    }
});

import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_API_KEY.startsWith("sk-")) {
  console.error("❌ ERROR: Invalid OpenAI API key! Check your .env file.");
  process.exit(1); // Stop server if API key is invalid
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY.trim(), // Ensure no extra spaces
});

app.use(express.json());
app.use(cors());

app.post("/chat", async (req, res) => {  // ✅ Ensure function is async
  try {
    const userMessage = req.body.message;
    if (!userMessage) return res.json({ response: "Please type something." });

    // Generate AI response
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: userMessage }]
    });

    if (!aiResponse || !aiResponse.choices) {
        throw new Error("Invalid AI response");
    }

    const botMessage = aiResponse.choices[0].message.content.trim();

    // ✅ Ensure await is inside an async function
    const chat = new Chat({ userMessage, botMessage });
    await chat.save();  // ✅ Now it works inside an async function

    res.json({ response: botMessage });

  } catch (error) {
    console.error("AI Error:", error);
    res.json({ response: "I'm having trouble thinking right now. Try again later." });
  }
});

app.post("/test", async (req, res) => {
    console.log(req.body); // ✅ Access `req.body` normally
    res.send("Success");
});

app.get("/api/weather", async (req, res) => {
    const city = req.query.city;
    if (!city) {
        return res.status(400).json({ error: "City name required" });
    }

    const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch weather data" });
    }
});

// Global Error Handling Middleware
app.use((err, req, res, next) => {
    console.error("🚨 Uncaught Error:", err);
    res.status(500).json({ error: "Something went wrong" });
});

// Your other routes and middleware here

const sendMessage = async () => {
    const chatInput = document.getElementById("chat-input");
    const message = chatInput.value.trim();
    const sender = "User"; // Replace with actual sender info

    if (!message) {
        alert("Message cannot be empty");
        return;
    }

    const response = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sender })
    });

    if (!response.ok) {
        console.error("Chat API error:", response.statusText);
    } else {
        console.log("Message sent successfully");
        chatInput.value = ""; // Clear input after sending
    }
};

const apiKey = "2149cbc5da7384b8ef7bcccf62b0bf68"; // Ensure this is valid

const fetchWeatherAlerts = async (city) => {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("No weather alerts available");
        return await response.json();
    } catch (error) {
        console.warn("No alerts found for", city);
        return null;
    }
};

// Fetch weather data from API
async function fetchWeatherData(city) {
    try {
        if (!city) throw new Error("City name is required");

        const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`);

        if (!response.ok) {
            const errorMessage = `API Error ${response.status}: ${response.statusText}`;
            throw new Error(errorMessage);
        }

        const data = await response.json();
        if (!data || !data.main) {
            throw new Error("Invalid weather data received");
        }

        return data;
    } catch (error) {
        console.error("❌ Weather API error:", error.message);
        return null; // Prevents app from crashing
    }
}

// Fetch weather data from API
async function fetchWeather(city) {
    if (!city || city.trim() === "") {
        alert("Please enter a valid city name.");
        return;
    }

    try {
        const weatherData = await fetchWeatherData(city);

        if (!weatherData) {
            alert("❌ Error fetching weather data.");
            return;
        }

        updateWeatherUI(weatherData);
        fetchWeatherForecast(city); // Fetch and update the forecast
        fetchWeatherAlerts(city); // Fetch and display weather alerts
    } catch (error) {
        console.error("❌ Error fetching weather data:", error);
        alert(`❌ Error: ${error.message}`);
    }
}

const saveCity = async (city) => {
    const response = await fetch("/cities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city })
    });

    if (response.status === 401) {
        alert("You must be logged in to save a city.");
        return;
    }

    if (!response.ok) {
        console.error("Failed to save city:", response.statusText);
    } else {
        console.log("City saved successfully");
    }
};

app.get('/api', (req, res) => {
    res.json({ message: "API is working" });
});
