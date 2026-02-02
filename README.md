# 🍻 Fugida
**Your next night out decided in seconds.**

**Fugida** is an intelligent web application designed to eliminate indecision when going out.
Based on your **location**, **desired vibe**, and **budget**, the app finds the best leisure options, calculates transportation costs, and ensures your plans fit your budget.

---

## 🚀 Features

- 📍 **Smart Geolocation**
  Automatically detects your location or allows manual search by neighborhood or city.

- 🔎 **Vibe-Based Search**
  Filters by categories such as:
  - Bars
  - Romantic Restaurants
  - Nightclubs
  - Outdoor Activities
  - Culture

- 💰 **Budget Calculator**
  Estimates Uber/99 transportation costs (round trip) and shows how much money remains to spend at the venue.

- 🚗 **Transport Integration**
  Deep links to open the destination directly in the **Uber** or **99Pop** app.

- ⭐ **Complete Venue Details**
  Photos, reviews, average rating, and opening hours via **Google Places API**.

- 🔐 **Social Login**
  Fast and secure authentication using **Google**.

---

## 🛠️ Technologies Used

### Backend
- Node.js
- Express

### Frontend
- EJS (Embedded JavaScript Templates)
- Modern CSS3

### Database
- MySQL

### External APIs
- Google Maps JavaScript API
- Google Places API (Text Search & Details)
- Google Distance Matrix API
- Google Geocoding API

### Authentication
- Passport.js (Google Strategy)

---

## ⚙️ Installation and Setup

### 1. Prerequisites
- Node.js installed
- MySQL installed and running
- Google Cloud Platform account with Maps APIs enabled

---

### 2. Clone the repository
```bash
git clone https://github.com/your-username/fugida.git
cd fugida
```

---

### 3. Install dependencies
```bash
npm install
```

---

### 4. Database Configuration

Create a MySQL database and run the script below:
```text
database/schema.sql
```

---

### 5. Environment Variables

Create a `.env` file at the root of the project:

```env
# Server
PORT=3000
SESSION_SECRET=your_secret_key_here

# Google Maps Platform
GOOGLE_MAPS_API_KEY=your_google_api_key
GOOGLE_PLACES_API_KEY=your_google_api_key
GOOGLE_DISTANCE_MATRIX_API_KEY=your_google_api_key

# Google OAuth
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Database
DB_HOST=localhost
DB_USER=root
DB_PASS=your_mysql_password
DB_NAME=fugida_db
```

---

### 6. Running the application

#### Development mode
```bash
npm run dev
```

#### Production mode
```bash
node app.js
```

Open in your browser:
👉 **http://localhost:3000**

---

## 📄 License
This project is for educational and portfolio purposes.
