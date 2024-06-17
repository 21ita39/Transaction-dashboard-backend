const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');
const app = express();
app.use(cors())
// Middleware
app.use(bodyParser.json());

// MongoDB URI (replace with your own URI)
const dbUri = 'mongodb://localhost:27017/drive';  // Replace with your actual MongoDB URI

// Connect to MongoDB
mongoose.connect(dbUri)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Transaction Schema and Model
const transactionSchema = new mongoose.Schema({
    id: Number,
    title: String,
    description: String,
    price: Number,
    category: String,
    sold: Boolean,
    dateOfSale: Date,
    image: String  // New field for image URL
  });
  
const Transaction = mongoose.model('Transaction', transactionSchema);



  app.get('/api/initialize', async (req, res) => {
    try {
      const { data } = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
      await Transaction.deleteMany({});
      await Transaction.insertMany(data.map(transaction => ({
        ...transaction,
        imageUrl: `https://example.com/path/to/image/${transaction.id}.jpg`
      })));
      res.status(200).send({ message: 'Database initialized successfully' });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });
  
  const getMonthBoundaries = (year, month) => {
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));   // Month is 0-based in JavaScript Date
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59));      // Setting day to 0 gives last day of previous month
    return { start, end };
  };
  
  // Express route to fetch transactions for a specific month
  app.get('/api/transactions', async (req, res) => {
    try {
      const { year,month, search = '', page = 1, perPage = 10 } = req.query;
      const { start, end } = getMonthBoundaries(parseInt(year), parseInt(month));
  
      console.log('Fetching transactions for month:',year, month);  // Debugging log
      console.log('Date range:', start, 'to', end);            // Debugging log
  
      // Constructing the query for MongoDB
      const query = {
        dateOfSale: {
          $gte: start,
          $lt: end
        },
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { price: !isNaN(parseFloat(search)) ? parseFloat(search) : { $exists: true } }
        ]
      };
  
      // Perform pagination
      const totalCount = await Transaction.countDocuments(query);
      const totalPages = Math.ceil(totalCount / perPage);
      const transactions = await Transaction.find(query)
        .skip((page - 1) * perPage)
        .limit(parseInt(perPage))
        .exec();
  
      console.log('Transactions found:', transactions.length);  // Debugging log
  
      res.status(200).json({
        transactions
      });
    } catch (error) {
      console.error('Error fetching transactions:', error);  // Debugging log
      res.status(500).send({ error: 'Error fetching transactions' });
    }
  });

// API to get statistics for a given month
app.get('/api/statistics', async (req, res) => {
    const { year, month } = req.query;
  
    // Parse month and year inputs
    const parsedMonth = parseInt(month);
    const parsedYear = parseInt(year);
  
    // Validate inputs (optional step)
    if (isNaN(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
      return res.status(400).json({ error: 'Invalid month' });
    }
    if (isNaN(parsedYear)) {
      return res.status(400).json({ error: 'Invalid year' });
    }
  
    // Calculate start and end dates for the selected month and year
    const startDate = new Date(parsedYear, parsedMonth - 1, 1);
    const endDate = new Date(parsedYear, parsedMonth, 0);
  
    try {
      // Fetch transactions within the specified date range
      const transactions = await Transaction.find({
        dateOfSale: { $gte: startDate, $lt: endDate },
      });
  
      // Calculate statistics
      const totalSaleAmount = transactions.reduce((sum, transaction) => sum + transaction.price, 0);
      const totalSoldItems = transactions.filter((transaction) => transaction.isSold).length;
      const totalNotSoldItems = transactions.length - totalSoldItems;
  
      // Respond with statistics
      res.json({
        totalSaleAmount,
        totalSoldItems,
        totalNotSoldItems,
      });
    } catch (error) {
      console.error('Error fetching statistics:', error.message);
      res.status(500).send('Error fetching statistics');
    }
  });

  app.get('/api/bar-chart', async (req, res) => {
    const { year, month } = req.query;
    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  
    try {
      const transactions = await Transaction.find({
        dateOfSale: { $gte: startDate, $lt: endDate },
      });
  
      const priceRanges = {
        '0-100': 0,
        '101-200': 0,
        '201-300': 0,
        '301-400': 0,
        '401-500': 0,
        '501-600': 0,
        '601-700': 0,
        '701-800': 0,
        '801-900': 0,
        '901-above': 0,
      };
  
      transactions.forEach((transaction) => {
        if (transaction.price >= 0 && transaction.price <= 100) priceRanges['0-100']++;
        else if (transaction.price >= 101 && transaction.price <= 200) priceRanges['101-200']++;
        else if (transaction.price >= 201 && transaction.price <= 300) priceRanges['201-300']++;
        else if (transaction.price >= 301 && transaction.price <= 400) priceRanges['301-400']++;
        else if (transaction.price >= 401 && transaction.price <= 500) priceRanges['401-500']++;
        else if (transaction.price >= 501 && transaction.price <= 600) priceRanges['501-600']++;
        else if (transaction.price >= 601 && transaction.price <= 700) priceRanges['601-700']++;
        else if (transaction.price >= 701 && transaction.price <= 800) priceRanges['701-800']++;
        else if (transaction.price >= 801 && transaction.price <= 900) priceRanges['801-900']++;
        else if (transaction.price >= 901) priceRanges['901-above']++;
      });
  
      res.json(priceRanges);
    } catch (error) {
      console.error('Error fetching bar chart data:', error.message);
      res.status(500).send('Error fetching bar chart data');
    }
  });

  app.get('/api/pie-chart', async (req, res) => {
    const { year, month } = req.query;
    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  
    try {
      const transactions = await Transaction.find({
        dateOfSale: { $gte: startDate, $lt: endDate },
      });
  
      const categoryCounts = {};
  
      transactions.forEach((transaction) => {
        if (categoryCounts[transaction.category]) {
          categoryCounts[transaction.category]++;
        } else {
          categoryCounts[transaction.category] = 1;
        }
      });
  
      res.json(categoryCounts);
    } catch (error) {
      console.error('Error fetching pie chart data:', error.message);
      res.status(500).send('Error fetching pie chart data');
    }
  });
  

// API to combine data from the statistics, bar chart, and pie chart APIs
app.get('/api/combined-data', async (req, res) => {
    const { year, month } = req.query;
  
    try {
      const [statisticsResponse, barChartResponse, pieChartResponse] = await Promise.all([
        axios.get(`http://localhost:5000/api/statistics?year=${year}&month=${month}`),
        axios.get(`http://localhost:5000/api/bar-chart?year=${year}&month=${month}`),
        axios.get(`http://localhost:5000/api/pie-chart?year=${year}&month=${month}`),
      ]);
  
      res.json({
        statistics: statisticsResponse.data,
        barChartData: barChartResponse.data,
        pieChartData: pieChartResponse.data,
      });
    } catch (error) {
      console.error('Error fetching combined data:', error.message);
      res.status(500).send('Error fetching combined data');
    }
  });
  
// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
