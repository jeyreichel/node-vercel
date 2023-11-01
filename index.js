const express = require('express');
const axios = require('axios');
const sgMail = require('@sendgrid/mail');
const admin = require('firebase-admin');
require('dotenv').config()
const cors = require('cors');

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert({
    // Add your Firebase Admin SDK credentials here
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),  
    databaseURL: process.env.FIREBASE_DATABASE_URL,
}),
});

const app = express();
const port = 5050;

app.listen(port, () => console.log(`Server running on port ${port}`));
app.use(express.json());
app.use(cors());

sgMail.setApiKey(process.env.SENDGRID_API_KEY);


app.get('/api', async (req, res) => {
    res.send('API is running');
});

app.get('/stock', async (req, res) => {
  const baseUrl = 'https://api.iex.cloud/v1/data/core/historical_prices/';

  const token = process.env.IEXCLOUD_API_KEY;

  const { symbol, range } = req.query;

  const response = await axios.get(`${baseUrl}${symbol}?range=${range}&token=${token}`);

  res.send(response.data);
});

app.get('/stockQuote', async (req, res) => {
  const baseUrl = 'https://api.iex.cloud/v1/data/core/quote/';

  const token = process.env.IEXCLOUD_API_KEY;

  const { symbolList } = req.query;

  const response = await axios.get(`${baseUrl}${symbolList}?token=${token}`);

  res.send(response.data);
});


// Define a function to send the email
async function sendEmail(portfolioData, email) {
  try {
    const text = 'This is a scheduled email Vercel.';
    const msg = {
      to: email,
      from: 'stuartsim.aus@gmail.com',
      subject: 'Logging Connection Vercel',
      html: generateEmailContent(portfolioData), // Replace with your email content
    };

    await sgMail.send(msg);

    console.log('Email sent');
  } catch (error) {
    console.error('Error sending email:', error);
    throw error; // Re-throw the error for handling at a higher level if needed
  }
}

function generateEmailContent(portfoliosData) {
  let emailContent = ''; // Initialize the email content

  // Loop through each portfolio in the response
  portfoliosData.forEach((portfolio) => {
    emailContent += `<h2>${portfolio.name}</h2>`; // Portfolio name as a heading
    emailContent += '<table border="1">'; // Start a table

    // Loop through each stock in the portfolio
    portfolio.stocks.forEach((stock) => {
      emailContent += `
        <tr>
          <td>${stock.stock}</td> <!-- Stock symbol -->
          <td>${stock.quantity}</td> <!-- Quantity -->
        </tr>
      `;
    });

    emailContent += '</table>'; // End the table for the portfolio
  });

  return emailContent;
}

// Endpoint to fetch subcollections for a user
async function sendEmailToUser(userId) {

  try {
    // const userId = req.params.userId;

    //get email address
    // Fetch the user's email from Firestore
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    let userEmail = userDoc.data().email;

    console.log('userEmail', userEmail);

    // Get references to the "portfolios" and "stocks" subcollections
    const portfoliosCollection = admin.firestore().collection('users').doc(userId).collection('portfolios');
    const stocksCollection = admin.firestore().collection('users').doc(userId).collection('stocks');

    // Fetch portfolios with emailAlerts set to true
    const portfoliosQuerySnapshot = await portfoliosCollection.where('emailAlerts', '==', true).get();
    const portfoliosData = [];

    // Iterate over portfolios with emailAlerts
    for (const portfolioDoc of portfoliosQuerySnapshot.docs) {
      const portfolioData = portfolioDoc.data();
      portfolioData.stocks = [];

      // Fetch associated stocks for this portfolio
      const stocksQuerySnapshot = await stocksCollection.where('portfolioId', '==', portfolioDoc.id).get();
      stocksQuerySnapshot.forEach((stockDoc) => {
        const stockData = stockDoc.data();
        // Include only basic information for each stock
        portfolioData.stocks.push({ stock: stockData.stock, quantity: stockData.quantity });
      });

      // Include portfolio name and associated stocks in the response
      if (portfolioData.stocks.length > 0) {
        portfoliosData.push({ name: portfolioData.name, stocks: portfolioData.stocks });
      }
    }

    if(userEmail !== 'stuartsim.aus+firebase@gmail.com'){
      userEmail = 'stuartsim.aus+alternate@gmail.com'
    }

    // Send the email
    await sendEmail(portfoliosData, userEmail);

    // res.json(portfoliosData);
  } catch (error) {
    console.error('Error fetching portfolios with alerts:', error);
    // res.status(500).send('Error fetching portfolios with alerts');
  }
};

// Endpoint to send emails to all users
app.get('/sendEmails', async (req, res) => {
  try {
    // Fetch all user documents from the "users" collection
    const usersQuerySnapshot = await admin.firestore().collection('users').get();

    // Initialize a delay counter
    let delay = 0;

    // Iterate over each user document and send an email with a cooldown
    usersQuerySnapshot.forEach((userDoc) => {
      const userId = userDoc.id;
      setTimeout(() => {
        sendEmailToUser(userId, delay);
        console.log('Email sent to user:', userId);
      }, delay);
      delay += 250; // 5 seconds (5000 milliseconds) cooldown between emails
    });

    res.send('Emails sent to all users');
  } catch (error) {
    console.error('Error sending emails to all users:', error);
    res.status(500).send('Error sending emails to all users');
  }
});




