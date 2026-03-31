// SmartServe — Node.js mode
const apiOrigin = (() => {
    if (window.SMARTSERVE_API_BASE) {
        return window.SMARTSERVE_API_BASE.replace(/\/+$/, "");
    }

    if (window.location.protocol === "file:") {
        return "http://localhost:8080";
    }

    return window.location.origin;
})();
const buildApiUrl = (path) => `${apiOrigin}/${path.replace(/^\/+/, "")}`;

const toast = document.getElementById("toast");
const adminBookings = document.getElementById("adminBookings");
const adminReviews = document.getElementById("adminReviews");

const api = async (path, options = {}) => {
    let response;
    try {
        response = await fetch(buildApiUrl(path), {
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {})
            },
            ...options
        });
    } catch (error) {
        throw new Error(`Unable to reach the SmartServe backend at ${apiOrigin}. Make sure server.js is running on port 8080.`);
    }

    const raw = await response.text();
    let data = {};
    if (raw) {
        try {
            data = JSON.parse(raw);
        } catch (error) {
            throw new Error(`The backend at ${apiOrigin} returned an invalid response.`);
        }
    }

    if (!response.ok) {
        throw new Error(data.message || "Request failed.");
    }

    return data;
};

const showToast = (message) => {
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.add("hidden"), 3200);
};

const formatCurrency = (value) => `Rs ${Number(value || 0).toFixed(2)}`;
const starsText = (rating) => `${"★".repeat(Math.round(Number(rating) || 0))}${"☆".repeat(Math.max(0, 5 - Math.round(Number(rating) || 0)))}`;
const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const renderBookings = (bookings) => {
    adminBookings.innerHTML = bookings.map((booking) => `
        <article class="booking-item surface-card">
            <header>
                <strong>${escapeHtml(booking.serviceName)}</strong>
                <span class="pill ${booking.bookingStatus === "CANCELLED" ? "pill-red" : "pill-green"}">${escapeHtml(booking.bookingStatus)}</span>
            </header>
            <div class="booking-meta">
                <span>${escapeHtml(booking.customerName)}</span>
                <span>${new Date(booking.appointmentTime).toLocaleString()}</span>
            </div>
            <p>${escapeHtml(booking.address)}</p>
            <p>${escapeHtml(booking.notes || "No extra notes provided.")}</p>
            <p>Total: ${formatCurrency(booking.totalAmount)} | Payment: ${escapeHtml(booking.paymentStatus)}</p>
        </article>
    `).join("") || "<p class='hint'>No bookings available.</p>";
};

const renderReviews = (reviews) => {
    adminReviews.innerHTML = reviews.map((review) => `
        <article class="review-card surface-card">
            <div class="review-card-top">
                <span class="service-rating">${starsText(review.rating)}</span>
                <span class="mini-label">${escapeHtml(review.serviceName)}</span>
            </div>
            <strong>${escapeHtml(review.title)}</strong>
            <p>${escapeHtml(review.comment)}</p>
            <div class="review-footer">
                <span>${escapeHtml(review.customerName)}</span>
                <span>${new Date(review.createdAt).toLocaleDateString()}</span>
            </div>
        </article>
    `).join("") || "<p class='hint'>No reviews available yet.</p>";
};

const loadAdmin = async () => {
    const session = await api("api/auth/session");
    if (!session.loggedIn || session.role !== "ADMIN") {
        window.location.href = "index.html";
        return;
    }

    const [overview, bookings, reviews] = await Promise.all([
        api("api/admin/overview"),
        api("api/bookings/"),
        api("api/reviews/?limit=6")
    ]);

    document.getElementById("totalBookings").textContent = overview.totalBookings;
    document.getElementById("totalCustomers").textContent = overview.totalCustomers;
    document.getElementById("activeServices").textContent = overview.activeServices;
    document.getElementById("totalRevenue").textContent = formatCurrency(overview.totalRevenue);
    document.getElementById("averageRating").textContent = Number(overview.averageRating || 0).toFixed(1);
    document.getElementById("totalReviews").textContent = overview.totalReviews;

    renderBookings(bookings.bookings || []);
    renderReviews(reviews.reviews || []);
};

document.getElementById("serviceForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.target).entries());
    payload.basePrice = Number(payload.basePrice);
    payload.serviceCharge = Number(payload.serviceCharge);
    payload.durationMinutes = Number(payload.durationMinutes);

    try {
        const result = await api("api/admin/services", {
            method: "POST",
            body: JSON.stringify(payload)
        });
        event.target.reset();
        showToast(result.message);
        await loadAdmin();
    } catch (error) {
        showToast(error.message);
    }
});

loadAdmin().catch((error) => showToast(error.message));
