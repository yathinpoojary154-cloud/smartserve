// SmartServe — Node.js mode (served from root)
const pathName = window.location.pathname;
const normalizeApiBase = (value) => String(value || "").replace(/\/+$/, "");
const computeApiOrigins = () => {
    const origins = [];

    if (window.SMARTSERVE_API_BASE) {
        origins.push(normalizeApiBase(window.SMARTSERVE_API_BASE));
    }

    if (window.location.protocol === "file:") {
        origins.push("http://localhost:8080");
        origins.push("http://127.0.0.1:8080");
        return [...new Set(origins)];
    }

    const nodeOrigin = `${window.location.protocol}//${window.location.hostname}:8080`;
    const loopbackOrigin = `${window.location.protocol}//127.0.0.1:8080`;
    const sameOrigin = normalizeApiBase(window.location.origin);

    // Prefer Node backend first for WAMP/Apache-hosted frontend setups.
    if (window.location.port === "8080") {
        origins.push(sameOrigin);
    } else {
        origins.push(nodeOrigin);
        origins.push(loopbackOrigin);
        origins.push(sameOrigin);
    }
    return [...new Set(origins)];
};
const apiOrigins = computeApiOrigins();
let activeApiOrigin = apiOrigins[0];
const buildApiUrl = (base, path) => `${base}/${path.replace(/^\/+/, "")}`;
const buildPageUrl = (path) => `/${path.replace(/^\/+/, "")}`;
const toast = document.getElementById("toast");
const servicesGrid = document.getElementById("servicesGrid");
const serviceSelect = document.getElementById("serviceSelect");
const paymentMethodSelect = document.getElementById("paymentMethodSelect");
const bookingsList = document.getElementById("bookingsList");
const logoutBtn = document.getElementById("logoutBtn");
const serviceSearch = document.getElementById("serviceSearch");
const categoryFilters = document.getElementById("categoryFilters");
const bookingSummary = document.getElementById("bookingSummary");
const serviceStatus = document.getElementById("serviceStatus");
const reviewsGrid = document.getElementById("reviewsGrid");
const reviewAverage = document.getElementById("reviewAverage");
const reviewCount = document.getElementById("reviewCount");
const reviewStars = document.getElementById("reviewStars");
const reviewBookingSelect = document.getElementById("reviewBookingSelect");

let currentSession = null;
let servicesCache = [];
let bookingsCache = [];
let activeCategory = "All";
let activeSearchTerm = "";
let usingDemoData = false;

const demoServices = [
    { id: 1, name: "Emergency Plumbing", category: "Plumber", description: "Pipe leaks, faucet repairs, drain clearing, and urgent water line fixes.", basePrice: 799, serviceCharge: 149, durationMinutes: 90, active: true, averageRating: 4.8, reviewCount: 124 },
    { id: 2, name: "Electrical Repair Visit", category: "Electrician", description: "Switchboard repairs, fan fitting, lighting fixes, and power troubleshooting.", basePrice: 899, serviceCharge: 179, durationMinutes: 90, active: true, averageRating: 4.7, reviewCount: 96 },
    { id: 3, name: "AC Deep Service", category: "AC Technician", description: "Cooling check, filter cleaning, gas inspection, and airflow optimization.", basePrice: 1499, serviceCharge: 249, durationMinutes: 120, active: true, averageRating: 4.9, reviewCount: 188 },
    { id: 4, name: "AC Installation", category: "AC Technician", description: "New AC fitting, bracket setup, pipe routing, and cooling performance checks.", basePrice: 2299, serviceCharge: 299, durationMinutes: 180, active: true, averageRating: 4.8, reviewCount: 72 },
    { id: 5, name: "Home Cleaning Plus", category: "Cleaning", description: "Kitchen, bathroom, living area and deep-surface premium cleaning service.", basePrice: 1299, serviceCharge: 199, durationMinutes: 150, active: true, averageRating: 4.6, reviewCount: 110 },
    { id: 6, name: "Sofa and Carpet Cleaning", category: "Cleaning", description: "Fabric-safe stain treatment, vacuum extraction, and deodorizing for soft furnishings.", basePrice: 1599, serviceCharge: 229, durationMinutes: 140, active: true, averageRating: 4.7, reviewCount: 84 },
    { id: 7, name: "Carpenter On Demand", category: "Carpenter", description: "Furniture assembly, hinge repair, shelves, and wooden fixture adjustments.", basePrice: 999, serviceCharge: 169, durationMinutes: 100, active: true, averageRating: 4.5, reviewCount: 63 },
    { id: 8, name: "Appliance Repair", category: "Appliance", description: "Washing machine, microwave, refrigerator and mixer repair diagnostics.", basePrice: 1199, serviceCharge: 219, durationMinutes: 110, active: true, averageRating: 4.6, reviewCount: 91 },
    { id: 9, name: "RO Water Purifier Service", category: "Appliance", description: "Filter replacement, membrane inspection, pressure check, and sanitization.", basePrice: 1099, serviceCharge: 189, durationMinutes: 95, active: true, averageRating: 4.7, reviewCount: 57 },
    { id: 10, name: "Pest Control Visit", category: "Home Care", description: "Targeted pest treatment for kitchen, storage, and high-risk household areas.", basePrice: 1799, serviceCharge: 269, durationMinutes: 120, active: true, averageRating: 4.8, reviewCount: 76 },
    { id: 11, name: "Painting Touch-Up", category: "Home Care", description: "Wall patching, stain cover, and small-area repainting for apartments and offices.", basePrice: 1899, serviceCharge: 289, durationMinutes: 180, active: true, averageRating: 4.5, reviewCount: 38 },
    { id: 12, name: "Smart Doorbell Installation", category: "Electrician", description: "Install and configure smart bells, chimes, and home entry accessories.", basePrice: 1399, serviceCharge: 199, durationMinutes: 85, active: true, averageRating: 4.7, reviewCount: 42 }
];

const sampleReviewOptions = [
    { label: "Example paid booking - AC Deep Service - Today", value: "" },
    { label: "Example paid booking - Emergency Plumbing - Tomorrow", value: "" },
    { label: "Example paid booking - Home Cleaning Plus - This weekend", value: "" }
];

const api = async (path, options = {}) => {
    const orderedOrigins = [activeApiOrigin, ...apiOrigins.filter((origin) => origin !== activeApiOrigin)];
    let lastReachError = null;
    let lastParseError = null;

    for (let index = 0; index < orderedOrigins.length; index += 1) {
        const origin = orderedOrigins[index];
        let response;
        try {
            response = await fetch(buildApiUrl(origin, path), {
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    ...(options.headers || {})
                },
                ...options
            });
        } catch (error) {
            lastReachError = origin;
            continue;
        }

        const raw = await response.text();
        let data = {};
        if (raw) {
            try {
                data = JSON.parse(raw);
            } catch (error) {
                lastParseError = origin;
                continue;
            }
        }

        if (!response.ok) {
            throw new Error(data.message || `Request failed (${response.status}).`);
        }

        activeApiOrigin = origin;
        return data;
    }

    if (lastReachError) {
        throw new Error(`Unable to reach the SmartServe backend at ${lastReachError}.`);
    }
    if (lastParseError) {
        throw new Error(`The backend at ${lastParseError} did not return JSON.`);
    }
    throw new Error("Unable to complete the request right now.");
};

const showToast = (message) => {
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.add("hidden"), 4200);
};

const formatCurrency = (value) => `Rs ${Number(value || 0).toFixed(2)}`;
const starsText = (rating) => {
    const full = Math.round(Number(rating) || 0);
    return `${"*".repeat(full)}${".".repeat(Math.max(0, 5 - full))}`;
};
const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const getVisibleServices = () => servicesCache.filter((service) => {
    const matchesCategory = activeCategory === "All" || service.category === activeCategory;
    const needle = activeSearchTerm.trim().toLowerCase();
    const haystack = `${service.name} ${service.category} ${service.description}`.toLowerCase();
    return service.active && matchesCategory && (!needle || haystack.includes(needle));
});

const renderCategoryFilters = () => {
    const categories = ["All", ...new Set(servicesCache.filter((service) => service.active).map((service) => service.category))];
    categoryFilters.innerHTML = categories.map((category) => `
        <button
            type="button"
            class="chip ${category === activeCategory ? "chip-active" : ""}"
            data-category="${escapeHtml(category)}">
            ${escapeHtml(category)}
        </button>
    `).join("");
};

const updateBookingSummary = () => {
    const service = servicesCache.find((item) => String(item.id) === serviceSelect.value);
    if (!service) {
        bookingSummary.innerHTML = `
            <div>
                <span class="summary-label">Selected service</span>
                <strong>Choose a service to preview details</strong>
            </div>
            <div>
                <span class="summary-label">Estimated duration</span>
                <strong>--</strong>
            </div>
            <div>
                <span class="summary-label">Estimated total</span>
                <strong>Rs 0.00</strong>
            </div>
        `;
        return;
    }

    const total = Number(service.basePrice) + Number(service.serviceCharge);
    const paymentLabel = paymentMethodSelect.value === "PAY_LATER" ? "Pay later" : `Pay now with ${paymentMethodSelect.value}`;
    bookingSummary.innerHTML = `
        <div>
            <span class="summary-label">Selected service</span>
            <strong>${escapeHtml(service.name)}</strong>
            <p>${escapeHtml(service.category)} | ${Number(service.reviewCount)} reviews</p>
        </div>
        <div>
            <span class="summary-label">Estimated duration</span>
            <strong>${service.durationMinutes} minutes</strong>
        </div>
        <div>
            <span class="summary-label">Estimated total</span>
            <strong>${formatCurrency(total)}</strong>
            <p>${paymentLabel} | ${starsText(service.averageRating)} ${Number(service.averageRating).toFixed(1)} average rating</p>
        </div>
    `;
};

const renderServices = () => {
    const visibleServices = getVisibleServices();
    const activeServices = servicesCache.filter((service) => service.active);

    serviceSelect.innerHTML = '<option value="">Choose a service</option>' + activeServices
        .map((service) => `<option value="${service.id}">${escapeHtml(service.name)} | ${formatCurrency(Number(service.basePrice) + Number(service.serviceCharge))}</option>`)
        .join("");

    if (activeServices.length && !activeServices.some((service) => String(service.id) === serviceSelect.value)) {
        serviceSelect.value = String(activeServices[0].id);
    }

    servicesGrid.innerHTML = visibleServices.map((service) => `
        <article class="service-card surface-card">
            <div class="service-card-top">
                <span class="pill pill-soft">${escapeHtml(service.category)}</span>
                <span class="service-duration">${service.durationMinutes} min</span>
            </div>
            <strong>${escapeHtml(service.name)}</strong>
            <p>${escapeHtml(service.description)}</p>
            <div class="service-meta">
                <span class="service-rating">${starsText(service.averageRating)} ${Number(service.averageRating).toFixed(1)}</span>
                <small>${Number(service.reviewCount)} reviews</small>
            </div>
            <div class="service-price">
                <span>${formatCurrency(Number(service.basePrice) + Number(service.serviceCharge))}</span>
                <small>${formatCurrency(service.basePrice)} base + ${formatCurrency(service.serviceCharge)} fee</small>
            </div>
            <button type="button" class="primary-btn service-cta" data-select-service="${service.id}">Select service</button>
        </article>
    `).join("") || "<p class='hint'>No services matched your search yet.</p>";

    serviceStatus.textContent = activeServices.length
        ? `${activeServices.length} services are ready to browse.`
        : "No services are available right now.";

    updateBookingSummary();
};

const renderBookings = () => {
    if (!bookingsCache.length) {
        bookingsList.innerHTML = "<p class='hint'>No bookings yet. Login and create your first request.</p>";
        return;
    }

    bookingsList.innerHTML = bookingsCache.map((booking) => `
        <article class="booking-item surface-card">
            <header>
                <strong>${escapeHtml(booking.serviceName)}</strong>
                <span class="pill ${booking.bookingStatus === "CANCELLED" ? "pill-red" : "pill-green"}">${escapeHtml(booking.bookingStatus)}</span>
            </header>
            <div class="booking-meta">
                <span>${escapeHtml(booking.category)}</span>
                <span>${new Date(booking.appointmentTime).toLocaleString()}</span>
            </div>
            <p>${escapeHtml(booking.address)}</p>
            <p>${escapeHtml(booking.notes || "No extra notes provided.")}</p>
            <p>Total: ${formatCurrency(booking.totalAmount)} | Payment: ${escapeHtml(booking.paymentStatus)}</p>
            <div class="booking-actions">
                ${booking.paymentStatus !== "PAID" && booking.bookingStatus === "BOOKED" ? `<button class="primary-btn" data-pay="${booking.id}" type="button">Pay now</button>` : ""}
                ${booking.bookingStatus === "BOOKED" ? `<button class="ghost-btn" data-cancel="${booking.id}" type="button">Cancel</button>` : ""}
                ${booking.canReview ? `<button class="ghost-btn" data-review="${booking.id}" type="button">Write review</button>` : ""}
                ${booking.reviewSubmitted ? `<span class="pill pill-blue">Review submitted</span>` : ""}
            </div>
        </article>
    `).join("");
};

const renderReviewOptions = () => {
    const reviewableBookings = bookingsCache.filter((booking) => booking.canReview);

    if (reviewableBookings.length) {
        reviewBookingSelect.innerHTML = '<option value="">Choose a paid booking</option>' + reviewableBookings
            .map((booking) => `<option value="${booking.id}">${escapeHtml(booking.serviceName)} | ${new Date(booking.appointmentTime).toLocaleDateString()}</option>`)
            .join("");
        return;
    }

    if (usingDemoData) {
        reviewBookingSelect.innerHTML = '<option value="">Choose a paid booking</option>' + sampleReviewOptions
            .map((item) => `<option value="" disabled>${escapeHtml(item.label)}</option>`)
            .join("");
        return;
    }

    if (!currentSession?.loggedIn) {
        reviewBookingSelect.innerHTML = '<option value="">Login first to review a paid booking</option>';
        return;
    }

    reviewBookingSelect.innerHTML = '<option value="">No paid bookings yet. Complete one booking and pay to review it.</option>';
};

const renderReviews = (payload) => {
    reviewAverage.textContent = Number(payload.averageRating || 0).toFixed(1);
    reviewStars.textContent = starsText(payload.averageRating || 0);
    reviewCount.textContent = `${Number(payload.totalReviews || 0)} verified reviews`;

    reviewsGrid.innerHTML = (payload.reviews || []).map((review) => `
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
    `).join("") || "<p class='hint'>Customer reviews will appear here after the first paid booking is reviewed.</p>";
};

const loadSession = async () => {
    currentSession = await api("api/auth/session");
    logoutBtn.classList.toggle("hidden", !currentSession.loggedIn);
};

const loadServices = async () => {
    const data = await api("api/services");
    usingDemoData = false;
    servicesCache = data.services || [];
    renderCategoryFilters();
    renderServices();
};

const loadBookings = async () => {
    if (!currentSession?.loggedIn) {
        bookingsCache = [];
        renderBookings();
        renderReviewOptions();
        return;
    }

    const data = await api("api/bookings/");
    bookingsCache = data.bookings || [];
    renderBookings();
    renderReviewOptions();
};

const loadReviews = async () => {
    if (usingDemoData) {
        renderReviews({
            averageRating: 4.7,
            totalReviews: demoServices.reduce((total, service) => total + Number(service.reviewCount || 0), 0),
            reviews: []
        });
        reviewsGrid.innerHTML = "<p class='hint'>Live reviews need the SmartServe backend. Demo mode is showing sample service data for now.</p>";
        return;
    }

    const selectedServiceId = serviceSelect.value;
    const query = selectedServiceId ? `?serviceId=${encodeURIComponent(selectedServiceId)}&limit=6` : "?limit=6";
    const data = await api(`api/reviews/${query}`);
    renderReviews(data);
};

document.getElementById("signupForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    try {
        await api("api/auth/signup", {
            method: "POST",
            body: JSON.stringify(Object.fromEntries(formData.entries()))
        });
        event.target.reset();
        showToast("Account created. You can login now.");
    } catch (error) {
        showToast(error.message);
    }
});

document.getElementById("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    try {
        const data = await api("api/auth/login", {
            method: "POST",
            body: JSON.stringify(Object.fromEntries(formData.entries()))
        });
        await loadSession();
        await loadBookings();
        showToast(`Welcome back, ${data.fullName}.`);
        if (data.role === "ADMIN") {
            setTimeout(() => {
                window.location.href = buildPageUrl("admin.html");
            }, 500);
        }
    } catch (error) {
        showToast(error.message);
    }
});

document.getElementById("bookingForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentSession?.loggedIn) {
        showToast("Please login before booking a service.");
        return;
    }

    if (usingDemoData) {
        showToast("Demo mode is active.");
        return;
    }

    const formData = Object.fromEntries(new FormData(event.target).entries());
    try {
        const booking = await api("api/bookings/", {
            method: "POST",
            body: JSON.stringify(formData)
        });
        event.target.reset();
        paymentMethodSelect.value = "PAY_LATER";
        updateBookingSummary();
        showToast(
            booking.paymentStatus === "PAID"
                ? `${booking.message} Payment reference: ${booking.transactionRef}.`
                : `${booking.message} Total due: ${formatCurrency(booking.totalAmount)}.`
        );
        await Promise.all([loadBookings(), loadReviews()]);
    } catch (error) {
        showToast(error.message);
    }
});

document.getElementById("reviewForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentSession?.loggedIn) {
        showToast("Please login before leaving a review.");
        return;
    }

    if (usingDemoData) {
            showToast("Reviews need the live backend.");
        return;
    }

    const payload = Object.fromEntries(new FormData(event.target).entries());
    payload.bookingId = Number(payload.bookingId);
    payload.rating = Number(payload.rating);

    try {
        const result = await api("api/reviews/", {
            method: "POST",
            body: JSON.stringify(payload)
        });
        event.target.reset();
        showToast(result.message);
        await Promise.all([loadBookings(), loadServices(), loadReviews()]);
    } catch (error) {
        showToast(error.message);
    }
});

bookingsList.addEventListener("click", async (event) => {
    const payId = event.target.dataset.pay;
    const cancelId = event.target.dataset.cancel;
    const reviewId = event.target.dataset.review;

    if (usingDemoData && (payId || cancelId || reviewId)) {
        showToast("Backend actions are disabled in demo mode.");
        return;
    }

    if (payId) {
        const paymentMethod = window.prompt("Enter payment method: CARD / UPI / WALLET / CASH");
        if (!paymentMethod) {
            return;
        }
        try {
            const payment = await api("api/payments/create", {
                method: "POST",
                body: JSON.stringify({ bookingId: Number(payId), paymentMethod })
            });
            showToast(`Payment success: ${payment.transactionRef}`);
            await Promise.all([loadBookings(), loadReviews()]);
        } catch (error) {
            showToast(error.message);
        }
    }

    if (cancelId) {
        try {
            const result = await api("api/bookings/cancel", {
                method: "POST",
                body: JSON.stringify({ bookingId: Number(cancelId) })
            });
            showToast(result.message);
            await loadBookings();
        } catch (error) {
            showToast(error.message);
        }
    }

    if (reviewId) {
        reviewBookingSelect.value = reviewId;
        document.getElementById("reviews").scrollIntoView({ behavior: "smooth", block: "start" });
    }
});

servicesGrid.addEventListener("click", (event) => {
    const serviceId = event.target.dataset.selectService;
    if (!serviceId) {
        return;
    }
    serviceSelect.value = serviceId;
    updateBookingSummary();
    loadReviews().catch((error) => showToast(error.message));
    document.getElementById("booking").scrollIntoView({ behavior: "smooth", block: "start" });
});

categoryFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) {
        return;
    }
    activeCategory = button.dataset.category;
    renderCategoryFilters();
    renderServices();
});

serviceSearch.addEventListener("input", (event) => {
    activeSearchTerm = event.target.value;
    renderServices();
});

serviceSelect.addEventListener("change", async () => {
    updateBookingSummary();
    try {
        await loadReviews();
    } catch (error) {
        showToast(error.message);
    }
});

paymentMethodSelect.addEventListener("change", updateBookingSummary);

logoutBtn.addEventListener("click", async () => {
    try {
        await api("api/auth/logout", { method: "POST" });
        currentSession = { loggedIn: false };
        bookingsCache = [];
        logoutBtn.classList.add("hidden");
        renderBookings();
        renderReviewOptions();
        showToast("Logged out.");
    } catch (error) {
        showToast(error.message);
    }
});

const bootstrap = async () => {
    try {
        await loadSession();
        await loadServices();
        await loadReviews();
        await loadBookings();
    } catch (error) {
        usingDemoData = true;
        currentSession = { loggedIn: false };
        servicesCache = demoServices;
        renderCategoryFilters();
        renderServices();
        serviceStatus.textContent = "";
        reviewAverage.textContent = "4.7";
        reviewStars.textContent = starsText(4.7);
        reviewCount.textContent = `${demoServices.reduce((total, service) => total + Number(service.reviewCount || 0), 0)} sample reviews`;
        reviewsGrid.innerHTML = "<p class='hint'>Reviews, login, and payments need the live SmartServe backend. Demo mode is active for browsing.</p>";
        renderBookings();
        renderReviewOptions();
    }
};

bootstrap();
