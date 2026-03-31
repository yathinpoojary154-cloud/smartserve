const express = require('express');
const mysql = require('mysql2/promise');
const session = require('express-session');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const SESSION_SECRET = process.env.SESSION_SECRET || 'smartserve-secret-key';
const APP_ORIGIN = (process.env.APP_ORIGIN || '').replace(/\/+$/, '');
const isProduction = NODE_ENV === 'production';

const parseAllowedOrigins = () => {
  if (!APP_ORIGIN) return true;
  return APP_ORIGIN
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const allowedOrigins = parseAllowedOrigins();

// ─── Database ────────────────────────────────────────────────────────────────
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'smartserve.c3uk2kciuri9.ap-south-1.rds.amazonaws.com',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'BAVIHOOMI05',
  database: process.env.DB_NAME || 'smartserve',
  waitForConnections: true,
  connectionLimit: 10,
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(cors({
  origin(origin, callback) {
    if (allowedOrigins === true || !origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS origin not allowed.'));
  },
  credentials: true
}));
app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 86400000,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction
  }
}));

// Serve frontend — find public folder robustly
const preferredPublicDir = path.join(__dirname, 'public');
const publicDir = fs.existsSync(preferredPublicDir) ? preferredPublicDir : __dirname;
app.use(express.static(publicDir));

// ─── Helpers ─────────────────────────────────────────────────────────────────
const hashPassword = (pw) => crypto.createHash('sha256').update(pw).digest('hex');

const requireLogin = (req, res, next) => {
  if (!req.session.userId) return res.status(401).json({ success: false, message: 'Login required.' });
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.session.userId) return res.status(401).json({ success: false, message: 'Login required.' });
  if (req.session.role !== 'ADMIN') return res.status(403).json({ success: false, message: 'Admin access required.' });
  next();
};

// ─── AUTH ─────────────────────────────────────────────────────────────────────
app.get('/api/auth/session', (req, res) => {
  if (!req.session.userId) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, userId: req.session.userId, fullName: req.session.fullName, role: req.session.role });
});

app.post('/api/auth/signup', async (req, res) => {
  const { fullName, email, password, phone } = req.body;
  if (!fullName || !email || !password)
    return res.status(400).json({ success: false, message: 'Name, email and password are required.' });
  try {
    await pool.execute(
      'INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, "CUSTOMER")',
      [fullName, email, phone || '', hashPassword(password)]
    );
    res.status(201).json({ success: true, message: 'Account created successfully.' });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Unable to create account. Email may already exist.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await pool.execute('SELECT id, full_name, role, password_hash FROM users WHERE email = ?', [email]);
    const user = rows[0];
    if (!user || user.password_hash !== hashPassword(password))
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    req.session.userId = user.id;
    req.session.fullName = user.full_name;
    req.session.role = user.role;
    res.json({ success: true, message: 'Login successful.', role: user.role, fullName: user.full_name });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Unable to login right now.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true, message: 'Logged out.' });
});

// ─── SERVICES ─────────────────────────────────────────────────────────────────
app.get('/api/services', async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT s.id, s.name, s.category, s.description,
             s.base_price AS basePrice, s.service_charge AS serviceCharge,
             s.duration_minutes AS durationMinutes, s.active,
             COALESCE(ROUND(AVG(r.rating),1), 0) AS averageRating,
             COUNT(r.id) AS reviewCount
      FROM services s
      LEFT JOIN reviews r ON r.service_id = s.id
      GROUP BY s.id
      ORDER BY s.active DESC, s.name ASC
    `);
    rows.forEach(r => {
      r.active = !!r.active;
      r.averageRating = parseFloat(r.averageRating);
      r.reviewCount = parseInt(r.reviewCount);
      r.basePrice = parseFloat(r.basePrice);
      r.serviceCharge = parseFloat(r.serviceCharge);
    });
    res.json({ success: true, services: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Unable to load services: ' + e.message });
  }
});

app.post('/api/admin/services', requireAdmin, async (req, res) => {
  const { name, category, description, basePrice, serviceCharge, durationMinutes } = req.body;
  try {
    await pool.execute(
      'INSERT INTO services (name, category, description, base_price, service_charge, duration_minutes, active) VALUES (?,?,?,?,?,?,1)',
      [name, category, description, basePrice || 0, serviceCharge || 0, durationMinutes || 60]
    );
    res.status(201).json({ success: true, message: 'Service added.' });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Unable to add service.' });
  }
});

// ─── BOOKINGS ─────────────────────────────────────────────────────────────────
app.get('/api/bookings/', requireLogin, async (req, res) => {
  try {
    const role = req.session.role;
    const uid = req.session.userId;
    const [rows] = await pool.execute(`
      SELECT b.id, b.service_id AS serviceId, b.booking_status AS bookingStatus,
             b.payment_status AS paymentStatus, b.address, b.notes,
             b.appointment_time AS appointmentTime, b.total_amount AS totalAmount,
             s.name AS serviceName, s.category,
             u.full_name AS customerName,
             r.id AS reviewId
      FROM bookings b
      JOIN services s ON s.id = b.service_id
      JOIN users u ON u.id = b.user_id
      LEFT JOIN reviews r ON r.booking_id = b.id
      WHERE (? = 'ADMIN') OR b.user_id = ?
      ORDER BY b.created_at DESC
    `, [role, uid]);
    rows.forEach(r => {
      r.totalAmount = parseFloat(r.totalAmount);
      r.appointmentTime = r.appointmentTime ? new Date(r.appointmentTime).toISOString() : null;
      r.reviewSubmitted = r.reviewId !== null;
      r.canReview = role !== 'ADMIN' && r.paymentStatus === 'PAID' && r.bookingStatus !== 'CANCELLED' && r.reviewId === null;
      delete r.reviewId;
    });
    res.json({ success: true, bookings: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Unable to fetch bookings.' });
  }
});

app.post('/api/bookings/', requireLogin, async (req, res) => {
  const { serviceId, address, notes, paymentMethod, appointmentTime } = req.body;
  const method = (paymentMethod || 'PAY_LATER').toUpperCase();
  const payNow = method !== 'PAY_LATER';
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [svcRows] = await conn.execute('SELECT base_price, service_charge FROM services WHERE id = ? AND active = 1', [serviceId]);
    if (!svcRows.length) { await conn.rollback(); conn.release(); return res.status(404).json({ success: false, message: 'Service not found.' }); }
    const total = parseFloat(svcRows[0].base_price) + parseFloat(svcRows[0].service_charge);
    const payStatus = payNow ? 'PAID' : 'PENDING';
    const [result] = await conn.execute(
      'INSERT INTO bookings (user_id, service_id, address, notes, appointment_time, total_amount, booking_status, payment_status) VALUES (?,?,?,?,?,?,"BOOKED",?)',
      [req.session.userId, serviceId, address, notes || '', appointmentTime, total, payStatus]
    );
    const bookingId = result.insertId;
    let txRef = null;
    if (payNow) {
      txRef = `SS-${Date.now()}-${bookingId}`;
      await conn.execute(
        'INSERT INTO payments (booking_id, amount, payment_method, payment_status, transaction_ref) VALUES (?,?,?,"PAID",?)',
        [bookingId, total, method, txRef]
      );
    }
    await conn.commit(); conn.release();
    res.status(201).json({ success: true, message: payNow ? 'Booking confirmed and payment completed.' : 'Booking confirmed.', bookingId, totalAmount: total, paymentStatus: payStatus, transactionRef: txRef || '' });
  } catch (e) {
    await conn.rollback(); conn.release();
    res.status(500).json({ success: false, message: 'Unable to create booking.' });
  }
});

app.post('/api/bookings/cancel', requireLogin, async (req, res) => {
  const { bookingId } = req.body;
  try {
    const [rows] = await pool.execute('SELECT appointment_time, booking_status, user_id FROM bookings WHERE id = ?', [bookingId]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Booking not found.' });
    const booking = rows[0];
    const isAdmin = req.session.role === 'ADMIN';
    if (!isAdmin && booking.user_id !== req.session.userId) return res.status(403).json({ success: false, message: 'You cannot cancel this booking.' });
    if (booking.booking_status !== 'BOOKED') return res.status(400).json({ success: false, message: 'Only active bookings can be cancelled.' });
    const appt = new Date(booking.appointment_time);
    const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000);
    if (!isAdmin && appt < cutoff) return res.status(400).json({ success: false, message: 'Bookings can only be cancelled at least 24 hours before service time.' });
    await pool.execute('UPDATE bookings SET booking_status = "CANCELLED" WHERE id = ?', [bookingId]);
    res.json({ success: true, message: 'Booking cancelled.' });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Unable to cancel booking.' });
  }
});

// ─── PAYMENTS ─────────────────────────────────────────────────────────────────
app.post('/api/payments/create', requireLogin, async (req, res) => {
  const { bookingId, paymentMethod } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT total_amount, user_id, payment_status FROM bookings WHERE id = ?', [bookingId]);
    if (!rows.length) { await conn.rollback(); conn.release(); return res.status(404).json({ success: false, message: 'Booking not found.' }); }
    const booking = rows[0];
    if (req.session.role !== 'ADMIN' && booking.user_id !== req.session.userId) { await conn.rollback(); conn.release(); return res.status(403).json({ success: false, message: 'Unauthorized.' }); }
    if (booking.payment_status === 'PAID') { await conn.rollback(); conn.release(); return res.status(400).json({ success: false, message: 'Already paid.' }); }
    const amount = parseFloat(booking.total_amount);
    const txRef = `SS-${Date.now()}-${bookingId}`;
    await conn.execute('INSERT INTO payments (booking_id, amount, payment_method, payment_status, transaction_ref) VALUES (?,?,?,"PAID",?)', [bookingId, amount, paymentMethod, txRef]);
    await conn.execute('UPDATE bookings SET payment_status = "PAID" WHERE id = ?', [bookingId]);
    await conn.commit(); conn.release();
    res.json({ success: true, message: 'Payment completed successfully.', transactionRef: txRef, amount });
  } catch (e) {
    await conn.rollback(); conn.release();
    res.status(500).json({ success: false, message: 'Unable to process payment.' });
  }
});

// ─── REVIEWS ──────────────────────────────────────────────────────────────────
app.get('/api/reviews/', async (req, res) => {
  const serviceId = req.query.serviceId ? parseInt(req.query.serviceId) : null;
  const limit = Math.max(1, Math.min(12, parseInt(req.query.limit) || 6));
  try {
    let summaryRow, reviewRows;
    if (serviceId) {
      [[summaryRow]] = await pool.execute('SELECT COALESCE(ROUND(AVG(rating),1),0) AS averageRating, COUNT(*) AS totalReviews FROM reviews WHERE service_id = ?', [serviceId]);
      [reviewRows] = await pool.execute(`SELECT r.rating, r.title, r.comment, r.created_at AS createdAt, u.full_name AS customerName, s.name AS serviceName FROM reviews r JOIN users u ON u.id=r.user_id JOIN services s ON s.id=r.service_id WHERE r.service_id = ? ORDER BY r.created_at DESC LIMIT ?`, [serviceId, limit]);
    } else {
      [[summaryRow]] = await pool.execute('SELECT COALESCE(ROUND(AVG(rating),1),0) AS averageRating, COUNT(*) AS totalReviews FROM reviews');
      [reviewRows] = await pool.execute(`SELECT r.rating, r.title, r.comment, r.created_at AS createdAt, u.full_name AS customerName, s.name AS serviceName FROM reviews r JOIN users u ON u.id=r.user_id JOIN services s ON s.id=r.service_id ORDER BY r.created_at DESC LIMIT ?`, [limit]);
    }
    res.json({ success: true, averageRating: parseFloat(summaryRow.averageRating), totalReviews: parseInt(summaryRow.totalReviews), reviews: reviewRows });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Unable to load reviews.' });
  }
});

app.post('/api/reviews/', requireLogin, async (req, res) => {
  const { bookingId, rating, title, comment } = req.body;
  if (!bookingId || !rating || !title || !comment) return res.status(400).json({ success: false, message: 'All fields required.' });
  if (rating < 1 || rating > 5) return res.status(400).json({ success: false, message: 'Rating must be 1-5.' });
  try {
    const [rows] = await pool.execute(`SELECT b.service_id, b.user_id, b.booking_status, b.payment_status, r.id AS reviewId FROM bookings b LEFT JOIN reviews r ON r.booking_id = b.id WHERE b.id = ?`, [bookingId]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Booking not found.' });
    const b = rows[0];
    if (b.user_id !== req.session.userId) return res.status(403).json({ success: false, message: 'You can only review your own bookings.' });
    if (b.payment_status !== 'PAID' || b.booking_status === 'CANCELLED') return res.status(400).json({ success: false, message: 'Only paid active bookings can be reviewed.' });
    if (b.reviewId) return res.status(400).json({ success: false, message: 'Review already exists.' });
    await pool.execute('INSERT INTO reviews (booking_id, service_id, user_id, rating, title, comment) VALUES (?,?,?,?,?,?)', [bookingId, b.service_id, req.session.userId, rating, title, comment]);
    res.status(201).json({ success: true, message: 'Review submitted successfully.' });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Unable to submit review.' });
  }
});

// ─── ADMIN ────────────────────────────────────────────────────────────────────
app.get('/api/admin/overview', requireAdmin, async (req, res) => {
  try {
    const [[metrics]] = await pool.execute(`
      SELECT
        (SELECT COUNT(*) FROM bookings) AS totalBookings,
        (SELECT COUNT(*) FROM users WHERE role='CUSTOMER') AS totalCustomers,
        (SELECT COUNT(*) FROM services WHERE active=1) AS activeServices,
        (SELECT COALESCE(SUM(amount),0) FROM payments WHERE payment_status='PAID') AS totalRevenue,
        (SELECT COALESCE(ROUND(AVG(rating),1),0) FROM reviews) AS averageRating,
        (SELECT COUNT(*) FROM reviews) AS totalReviews
    `);
    res.json({ success: true, ...metrics });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Unable to load admin overview.' });
  }
});

// ─── SPA fallback ─────────────────────────────────────────────────────────────
app.get('/admin.html', (req, res) => res.sendFile(path.join(publicDir, 'admin.html')));
app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  ================================');
  console.log('   SmartServe is running!');
  console.log(`   Port: ${PORT}`);
  if (APP_ORIGIN) {
    console.log(`   Allowed origin(s): ${APP_ORIGIN}`);
  } else {
    console.log(`   Open: http://localhost:${PORT}/`);
  }
  console.log(`   Database host: ${process.env.DB_HOST || '127.0.0.1'}`);
  console.log('  ================================');
  console.log('');
});
