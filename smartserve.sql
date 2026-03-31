CREATE DATABASE IF NOT EXISTS smartserve;
USE smartserve;

CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(160) NOT NULL UNIQUE,
    phone VARCHAR(30),
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('CUSTOMER', 'ADMIN') NOT NULL DEFAULT 'CUSTOMER',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS services (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(140) NOT NULL,
    category VARCHAR(80) NOT NULL,
    description TEXT NOT NULL,
    base_price DECIMAL(10, 2) NOT NULL,
    service_charge DECIMAL(10, 2) NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 60,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bookings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    service_id INT NOT NULL,
    address VARCHAR(255) NOT NULL,
    notes TEXT,
    appointment_time DATETIME NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    booking_status ENUM('BOOKED', 'CANCELLED', 'COMPLETED') NOT NULL DEFAULT 'BOOKED',
    payment_status ENUM('PENDING', 'PAID', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_bookings_service FOREIGN KEY (service_id) REFERENCES services(id)
);

CREATE TABLE IF NOT EXISTS payments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    booking_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(30) NOT NULL,
    payment_status ENUM('PAID', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PAID',
    transaction_ref VARCHAR(60) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_payments_booking FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

CREATE TABLE IF NOT EXISTS reviews (
    id INT PRIMARY KEY AUTO_INCREMENT,
    booking_id INT NOT NULL UNIQUE,
    service_id INT NOT NULL,
    user_id INT NOT NULL,
    rating INT NOT NULL,
    title VARCHAR(140) NOT NULL,
    comment TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT fk_reviews_booking FOREIGN KEY (booking_id) REFERENCES bookings(id),
    CONSTRAINT fk_reviews_service FOREIGN KEY (service_id) REFERENCES services(id),
    CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users(id)
);

INSERT INTO users (full_name, email, phone, password_hash, role)
VALUES
    ('SmartServe Admin', 'admin@smartserve.com', '9999999999', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'ADMIN'),
    ('Demo Customer', 'demo@smartserve.com', '8888888888', 'd3ad9315b7be5dd53b31a273b3b3aba5defe700808305aa16a3062b76658a791', 'CUSTOMER')
ON DUPLICATE KEY UPDATE email = VALUES(email);

INSERT INTO services (name, category, description, base_price, service_charge, duration_minutes, active)
VALUES
    ('Emergency Plumbing', 'Plumber', 'Pipe leaks, faucet repairs, drain clearing, and urgent water line fixes.', 799.00, 149.00, 90, TRUE),
    ('Electrical Repair Visit', 'Electrician', 'Switchboard repairs, fan fitting, lighting fixes, and power troubleshooting.', 899.00, 179.00, 90, TRUE),
    ('AC Deep Service', 'AC Technician', 'Cooling check, filter cleaning, gas inspection, and airflow optimization.', 1499.00, 249.00, 120, TRUE),
    ('AC Installation', 'AC Technician', 'New AC fitting, bracket setup, pipe routing, and cooling performance checks.', 2299.00, 299.00, 180, TRUE),
    ('Home Cleaning Plus', 'Cleaning', 'Kitchen, bathroom, living area and deep-surface premium cleaning service.', 1299.00, 199.00, 150, TRUE),
    ('Sofa and Carpet Cleaning', 'Cleaning', 'Fabric-safe stain treatment, vacuum extraction, and deodorizing for soft furnishings.', 1599.00, 229.00, 140, TRUE),
    ('Carpenter On Demand', 'Carpenter', 'Furniture assembly, hinge repair, shelves, and wooden fixture adjustments.', 999.00, 169.00, 100, TRUE),
    ('Appliance Repair', 'Appliance', 'Washing machine, microwave, refrigerator and mixer repair diagnostics.', 1199.00, 219.00, 110, TRUE),
    ('RO Water Purifier Service', 'Appliance', 'Filter replacement, membrane inspection, pressure check, and sanitization.', 1099.00, 189.00, 95, TRUE),
    ('Pest Control Visit', 'Home Care', 'Targeted pest treatment for kitchen, storage, and high-risk household areas.', 1799.00, 269.00, 120, TRUE),
    ('Painting Touch-Up', 'Home Care', 'Wall patching, stain cover, and small-area repainting for apartments and offices.', 1899.00, 289.00, 180, TRUE),
    ('Smart Doorbell Installation', 'Electrician', 'Install and configure smart bells, chimes, and home entry accessories.', 1399.00, 199.00, 85, TRUE)
ON DUPLICATE KEY UPDATE name = VALUES(name);
