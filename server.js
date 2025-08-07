require("dotenv").config();
const express = require("express");
const bcrypt = require("bcrypt");
const cors = require("cors");
const db = require("./db"); // Your db.js for connection pooling

const twilio = require("twilio");
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
if (!accountSid || !authToken) {
  console.error("Twilio credentials are missing! Check your .env file.");
  process.exit(1); // Exit the process if credentials are not set
}

const client = new twilio(accountSid, authToken);

// console.log("Twilio Account SID:", accountSid);
// console.log("Twilio Auth Token:", authToken);

const app = express();
app.use(express.json());
app.use(cors());

// Registration Route
app.post("/register", async (req, res) => {
  const { full_name, email, password, phone, dob, gender } = req.body;

  if (!full_name || !email || !password || !phone) {
    return res
      .status(400)
      .json({ message: "All required fields must be filled." });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = `INSERT INTO users (full_name, email, password, phone, dob, gender) VALUES (?, ?, ?, ?, ?, ?)`;
    const values = [full_name, email, hashedPassword, phone, dob, gender];

    db.query(sql, values, (err, result) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY") {
          return res.status(400).json({ message: "Email already registered!" });
        }
        console.error(err);
        return res.status(500).json({ message: "Database error" });
      }
      res.status(201).json({ message: "User registered successfully!" });
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/login", async (req, res) => {
  const { username, email, password } = req.body;
  console.log("Login attempt:", req.body); // Log login attempt

  if (!username || !email || !password) {
    return res.status(400).json({ message: "All login fields are required." });
  }

  const sql = "SELECT * FROM users WHERE email = ? AND full_name = ?";
  db.query(sql, [email, username], async (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    console.log("Query results:", results); // Log query results

    if (results.length === 0) {
      return res
        .status(404)
        .json({ message: "User does not exist. Please sign up." });
    }

    const user = results[0];
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Incorrect password." });
    }

    res
      .status(200)
      .json({ message: "Login successful! Redirecting to bookings page..." });
  });
});

app.get("/flights", (req, res) => {
  let { source, destination, minPrice, maxPrice } = req.query;
  let sql = "SELECT * FROM flights";
  let conditions = [];
  let values = [];

  // Build conditions dynamically based on filters
  if (source) {
    conditions.push("source = ?");
    values.push(source);
  }
  if (destination) {
    conditions.push("destination = ?");
    values.push(destination);
  }
  if (minPrice) {
    conditions.push("price >= ?");
    values.push(parseFloat(minPrice)); // Ensure it's a number
  }
  if (maxPrice) {
    conditions.push("price <= ?");
    values.push(parseFloat(maxPrice)); // Ensure it's a number
  }

  // Append WHERE clause if any conditions exist
  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  console.log("SQL Query:", sql, "Values:", values); // Debug logging

  db.query(sql, values, (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.status(200).json(results);
  });
});

// app.get("/flights", (req, res) => {
//   const sql = "SELECT * FROM flights";
//   db.query(sql, (err, results) => {
//     if (err) {
//       console.error(err);
//       return res.status(500).json({ message: "Database error" });
//     }
//     res.status(200).json(results);
//   });
// });
// app.get("/flights", (req, res) => {
//   let { source, destination, minPrice, maxPrice } = req.query;
//   let sql = "SELECT * FROM flights";
//   let conditions = [];
//   let values = [];

//   // Build conditions dynamically based on filters
//   if (source) {
//     conditions.push("source = ?");
//     values.push(source);
//   }
//   if (destination) {
//     conditions.push("destination = ?");
//     values.push(destination);
//   }
//   if (minPrice) {
//     conditions.push("price >= ?");
//     values.push(minPrice);
//   }
//   if (maxPrice) {
//     conditions.push("price <= ?");
//     values.push(maxPrice);
//   }
//   // Append WHERE clause if any conditions exist
//   if (conditions.length > 0) {
//     sql += " WHERE " + conditions.join(" AND ");
//   }

//   console.log("SQL Query:", sql, "Values:", values); // Debug logging

//   db.query(sql, values, (err, results) => {
//     if (err) {
//       console.error("Database error:", err);
//       return res.status(500).json({ message: "Database error" });
//     }
//     res.status(200).json(results);
//   });
// });

app.post("/book", async (req, res) => {
  const { user_id, flight_id, seat_number, total_price } = req.body;

  // Insert booking into the bookings table
  const insertBookingSql = `
      INSERT INTO bookings (user_id, flight_id, seat_number, total_price)
      VALUES (?, ?, ?, ?)
    `;
  db.query(
    insertBookingSql,
    [user_id, flight_id, seat_number, total_price],
    (err, bookingResult) => {
      if (err) {
        console.error("Booking insert error:", err);
        return res
          .status(500)
          .json({ message: "Database error during booking" });
      }

      // Update the seat status to mark it as booked
      const updateSeatSql = `
        UPDATE seats 
        SET is_booked = TRUE 
        WHERE flight_id = ? AND seat_number = ?
      `;
      db.query(updateSeatSql, [flight_id, seat_number], (err2, seatResult) => {
        if (err2) {
          console.error("Error updating seat status:", err2);
          // Optionally: Rollback the booking here if necessary
        }

        // Return booking confirmation details (e.g., booking ID and flight details)
        res.status(201).json({
          message: "Booking confirmed!",
          bookingId: bookingResult.insertId,
          flight_id,
          seat_number,
          total_price,
          user_id,
        });
      });
    }
  );
});

app.post("/payment", async (req, res) => {
  const { booking_id, user_id, amount_paid, payment_method, transaction_id } =
    req.body;

  const insertPaymentSql = `
          INSERT INTO payments (booking_id, user_id, amount_paid, payment_method, transaction_id, payment_status)
          VALUES (?, ?, ?, ?, ?, 'Completed')
        `;

  db.query(
    insertPaymentSql,
    [booking_id, user_id, amount_paid, payment_method, transaction_id],
    (err, paymentResult) => {
      if (err) {
        console.error("Payment insert error:", err);
        return res
          .status(500)
          .json({ message: "Database error during payment processing" });
      }

      // Call SMS confirmation function here (if defined)
      sendSMSConfirmation(user_id, booking_id);

      res.status(201).json({ message: "Payment processed successfully!" });
    }
  );
});

// At the top of your server.js, require Twilio and initialize your client.

/**
 * sendSMSConfirmation - Sends a confirmation SMS to the user's phone.
 * @param {number} user_id - The user's ID.
 * @param {number} booking_id - The booking reference ID.
 */
function sendSMSConfirmation(user_id, booking_id) {
  // Retrieve the user's phone number from the database using user_id
  const sql = "SELECT phone, full_name FROM users WHERE user_id = ?";
  db.query(sql, [user_id], (err, results) => {
    if (err || results.length === 0) {
      console.error("Error retrieving user data for SMS:", err);
      return;
    }
    const user = results[0];
    const messageBody = `Hello ${user.full_name}, your booking (ID: ${booking_id}) has been confirmed. Thank you for choosing our service!`;

    client.messages
      .create({
        body: messageBody,
        from: "+17246539049", // Replace with your Twilio number
        to: "+91" + user.phone, // Ensure this is in the correct E.164 format, e.g., +919876543210 for India
      })
      .then((message) => {
        console.log("SMS sent successfully, SID:", message.sid);
      })
      .catch((err) => {
        console.error("Failed to send SMS:", err);
      });
  });
}

app.post("/admin/login", async (req, res) => {
  const { username, password } = req.body;
  const sql = "SELECT * FROM admins WHERE username = ?";
  db.query(sql, [username], async (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Database error" });
    }
    if (results.length === 0) {
      return res.status(404).json({ message: "Admin not found." });
    }
    const admin = results[0];
    const passwordMatch = await bcrypt.compare(password, admin.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Incorrect password." });
    }
    res.status(200).json({ message: "Admin login successful" });
  });
});

// Start Server
const PORT = 3000;
app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
